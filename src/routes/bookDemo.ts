import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { BookDemoEnrollment } from "../models/BookDemoEnrollment.js";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import { requireBookDemoToken } from "../middleware/bookDemoAuth.js";
import { createOtpChallenge, verifyOtpChallenge } from "../services/otpChallengeService.js";
import { getRazorpay, verifyPaymentSignature } from "../services/razorpayService.js";
import { getSmsSender } from "../services/sms/getSmsSender.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { signBookDemoToken } from "../util/bookDemoToken.js";
import { normalizeIndianMobile } from "../util/phone.js";
import { env } from "../env.js";

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
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
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
        `Little Champ Classes: Your OTP for Book Demo is ${code}. Valid for a few minutes. Do not share it.`,
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

    const enrollmentIdRaw = verified.meta.enrollmentId;
    if (typeof enrollmentIdRaw !== "string" || !mongoose.isValidObjectId(enrollmentIdRaw)) {
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

    const rz = getRazorpay();
    if (!rz) {
      res.status(503).json({
        error: "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
      return;
    }

    const receipt = `bd_${enrollment._id.toString().slice(-20)}`.replace(/[^a-zA-Z0-9_]/g, "_");

    const order = await rz.orders.create({
      amount: enrollment.amountPaise,
      currency: enrollment.currency || "INR",
      receipt: receipt.slice(0, 40),
      notes: {
        enrollmentId: enrollment._id.toString(),
        purpose: "book_demo",
      },
    });

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

    // Auto-create canonical Enrollment so the dashboard shows immediately
    const user = await User.findOne({ phoneE164: enrollment.phoneE164 }).lean();
    if (user && enrollment.batch) {
      await Enrollment.updateOne(
        { user: user._id, batch: enrollment.batch },
        {
          $setOnInsert: {
            user: user._id,
            batch: enrollment.batch,
            status: "active",
            source: "book_demo",
            purchasedAt: new Date(),
            bookDemoEnrollment: enrollment._id,
          },
        },
        { upsert: true },
      );
    }

    res.json({ ok: true, enrollmentId: enrollment._id.toString() });
  }),
);
