import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { BookDemoEnrollment } from "../models/BookDemoEnrollment.js";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { requireBookDemoToken } from "../middleware/bookDemoAuth.js";
import { createOtpChallenge, verifyOtpChallenge } from "../services/otpChallengeService.js";
import {
  createRazorpayOrder,
  RazorpayServiceError,
  verifyPaymentSignature,
} from "../services/razorpayService.js";
import { env } from "../env.js";
import { getSmsSender } from "../services/sms/getSmsSender.js";
import { publicUserResponse } from "./auth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { signUserAuthJwt } from "../util/authJwt.js";
import { signBookDemoToken } from "../util/bookDemoToken.js";
import { linkPaidBookDemoToUserEnrollment } from "../util/linkBookDemoEnrollment.js";
import { normalizeIndianMobile } from "../util/phone.js";

export const bookDemoRouter = Router();

const sendOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  courseSlug: z.string().min(1),
  batchId: z.string().min(1),
  grade: z.coerce.number().int().min(1).max(9).optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(8),
  /** From send-otp; required when OTP meta has no enrollmentId (e.g. dev bypass). */
  enrollmentId: z.string().trim().min(1).optional(),
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const createOrderAsUserSchema = z.object({
  courseSlug: z.string().min(1),
  batchId: z.string().min(1),
  grade: z.coerce.number().int().min(1).max(9),
});

bookDemoRouter.post(
  "/send-otp",
  asyncHandler(async (req, res) => {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const phone = normalizeIndianMobile(parsed.data.phone);
    if (!phone.ok) {
      res.status(400).json({ error: phone.error });
      return;
    }

    if (!mongoose.isValidObjectId(parsed.data.batchId)) {
      res.status(400).json({ error: "Invalid batch." });
      return;
    }

    const grade = parsed.data.grade ?? 1;

    const course = await Course.findOne({
      slug: parsed.data.courseSlug.trim().toLowerCase(),
      isActive: true,
    }).lean();
    if (!course) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    if (course.bookDemoEnabled !== true) {
      res.status(403).json({ error: "Book Demo is not available for this program." });
      return;
    }

    const batch = await CourseBatch.findOne({
      _id: parsed.data.batchId,
      course: course._id,
      isActive: true,
    }).lean();
    if (!batch) {
      res.status(404).json({ error: "Batch not found." });
      return;
    }

    const enrollment = await BookDemoEnrollment.findOneAndUpdate(
      {
        phoneE164: phone.e164,
        course: course._id,
        batch: batch._id,
        grade,
      },
      {
        $set: {
          amountPaise: course.pricePaise,
          currency: "INR",
          status: "draft",
          razorpayOrderId: "",
          razorpayPaymentId: "",
          paymentRef: "",
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const sms = getSmsSender();
    await createOtpChallenge({
      phoneE164: phone.e164,
      purpose: "book_demo",
      meta: { enrollmentId: enrollment._id.toString() },
      sms,
      messageBody: (code) =>
        `Your OTP Code is ${code}. Do not share it with anyone. From ConnectingHeart . #TeamDigiCoders`,
    });

    res.json({
      ok: true,
      resendAfterSeconds: Math.ceil(env.otpTtlMs / 1000),
      enrollmentId: enrollment._id.toString(),
    });
  }),
);

bookDemoRouter.post(
  "/verify-otp",
  asyncHandler(async (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const phone = normalizeIndianMobile(parsed.data.phone);
    if (!phone.ok) {
      res.status(400).json({ error: phone.error });
      return;
    }

    const verified = await verifyOtpChallenge({
      phoneE164: phone.e164,
      purpose: "book_demo",
      code: parsed.data.code,
    });

    if (!verified.ok) {
      res.status(400).json({ error: verified.error });
      return;
    }

    const metaId = verified.meta.enrollmentId;
    const bodyId = parsed.data.enrollmentId?.trim();
    let enrollmentIdRaw: string | undefined;
    if (typeof metaId === "string" && mongoose.isValidObjectId(metaId)) {
      enrollmentIdRaw = metaId;
    } else if (bodyId && mongoose.isValidObjectId(bodyId)) {
      enrollmentIdRaw = bodyId;
    }
    if (!enrollmentIdRaw) {
      res.status(400).json({ error: "Invalid enrollment context." });
      return;
    }

    const enrollment = await BookDemoEnrollment.findById(enrollmentIdRaw);
    if (!enrollment || enrollment.phoneE164 !== phone.e164) {
      res.status(400).json({ error: "Enrollment not found." });
      return;
    }

    enrollment.status = "otp_verified";
    await enrollment.save();

    const token = signBookDemoToken(enrollment._id.toString(), phone.e164);

    res.json({
      ok: true,
      token,
      enrollmentId: enrollment._id.toString(),
    });
  }),
);

bookDemoRouter.post(
  "/create-order",
  requireBookDemoToken,
  asyncHandler(async (req, res) => {
    const session = req.bookDemoSession;
    if (!session) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const enrollment = await BookDemoEnrollment.findById(session.enrollmentId);
    if (!enrollment || enrollment.phoneE164 !== session.phoneE164) {
      res.status(404).json({ error: "Enrollment not found." });
      return;
    }
    if (enrollment.status !== "otp_verified" && enrollment.status !== "payment_pending") {
      res.status(400).json({ error: "Complete OTP verification first." });
      return;
    }

    const receipt = `bd_${enrollment._id.toString().slice(-20)}`.replace(/[^a-zA-Z0-9_]/g, "_");

    let order: { id: string };
    try {
      order = await createRazorpayOrder({
        amountPaise: enrollment.amountPaise,
        currency: enrollment.currency || "INR",
        receipt,
        notes: {
          enrollmentId: enrollment._id.toString(),
          purpose: "book_demo",
        },
      });
    } catch (e) {
      if (e instanceof RazorpayServiceError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }

    enrollment.razorpayOrderId = order.id;
    enrollment.status = "payment_pending";
    await enrollment.save();

    res.json({
      keyId: env.razorpayKeyId,
      orderId: order.id,
      amount: enrollment.amountPaise,
      currency: enrollment.currency || "INR",
      enrollmentId: enrollment._id.toString(),
    });
  }),
);

/**
 * Logged-in shortcut: skip OTP entirely. The user JWT proves phone ownership
 * (it was already verified at login). Server reads phone from the User record,
 * not from the request, so the client cannot spoof a different number.
 */
bookDemoRouter.post(
  "/create-order-as-user",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = createOrderAsUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    if (!mongoose.isValidObjectId(parsed.data.batchId)) {
      res.status(400).json({ error: "Invalid batch." });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const user = await User.findById(userId).lean();
    if (!user || !user.phoneE164) {
      res.status(401).json({ error: "Account not found. Please sign in again." });
      return;
    }

    const course = await Course.findOne({
      slug: parsed.data.courseSlug.trim().toLowerCase(),
      isActive: true,
    }).lean();
    if (!course) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    if (course.bookDemoEnabled !== true) {
      res.status(403).json({ error: "Book Demo is not available for this program." });
      return;
    }

    const batch = await CourseBatch.findOne({
      _id: parsed.data.batchId,
      course: course._id,
      isActive: true,
    }).lean();
    if (!batch) {
      res.status(404).json({ error: "Batch not found." });
      return;
    }

    // Upsert enrollment for this (user-phone, course, batch, grade) tuple.
    // Skip OTP gate — start directly in "payment_pending"-eligible state.
    const enrollment = await BookDemoEnrollment.findOneAndUpdate(
      {
        phoneE164: user.phoneE164,
        course: course._id,
        batch: batch._id,
        grade: parsed.data.grade,
      },
      {
        $set: {
          amountPaise: course.pricePaise,
          currency: "INR",
        },
        $setOnInsert: {
          status: "otp_verified",
          razorpayOrderId: "",
          razorpayPaymentId: "",
          paymentRef: "",
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    // If the existing row was in a non-payable state, push it to otp_verified.
    if (enrollment.status === "draft" || enrollment.status === "failed" || enrollment.status === "cancelled") {
      enrollment.status = "otp_verified";
      enrollment.razorpayOrderId = "";
      enrollment.razorpayPaymentId = "";
      enrollment.paymentRef = "";
      await enrollment.save();
    }

    if (enrollment.status === "paid") {
      res.status(409).json({ error: "You have already booked this demo." });
      return;
    }

    const receipt = `bd_${enrollment._id.toString().slice(-20)}`.replace(/[^a-zA-Z0-9_]/g, "_");

    let order: { id: string };
    try {
      order = await createRazorpayOrder({
        amountPaise: enrollment.amountPaise,
        currency: enrollment.currency || "INR",
        receipt,
        notes: {
          enrollmentId: enrollment._id.toString(),
          purpose: "book_demo",
          userId: userId,
        },
      });
    } catch (e) {
      if (e instanceof RazorpayServiceError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }

    enrollment.razorpayOrderId = order.id;
    enrollment.status = "payment_pending";
    await enrollment.save();

    res.json({
      keyId: env.razorpayKeyId,
      orderId: order.id,
      amount: enrollment.amountPaise,
      currency: enrollment.currency || "INR",
      enrollmentId: enrollment._id.toString(),
    });
  }),
);

bookDemoRouter.post(
  "/verify-payment",
  asyncHandler(async (req, res) => {
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    if (
      !verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    ) {
      res.status(400).json({ error: "Invalid payment signature." });
      return;
    }

    const enrollment = await BookDemoEnrollment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!enrollment) {
      res.status(404).json({ error: "Enrollment not found for this order." });
      return;
    }

    enrollment.razorpayPaymentId = razorpay_payment_id;
    enrollment.paymentRef = razorpay_payment_id;
    enrollment.status = "paid";
    await enrollment.save();

    const { user } = await linkPaidBookDemoToUserEnrollment(
      enrollment.phoneE164,
      enrollment.batch,
      enrollment._id,
    );

    const token = signUserAuthJwt(user._id.toString(), user.phoneE164);

    res.json({
      ok: true,
      enrollmentId: enrollment._id.toString(),
      token,
      user: publicUserResponse(user),
      needsOnboarding: !user.profileComplete,
    });
  }),
);
