import { Router } from "express";
import { z } from "zod";
import { Course } from "../models/Course.js";
import { InterestedUser } from "../models/InterestedUser.js";
import { createOtpChallenge, verifyOtpChallenge } from "../services/otpChallengeService.js";
import { getSmsSender } from "../services/sms/getSmsSender.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { env } from "../env.js";
import { normalizeIndianMobile } from "../util/phone.js";

function clientIp(req: import("express").Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  if (Array.isArray(xff) && xff[0]) {
    return xff[0]!.split(",")[0]!.trim();
  }
  return req.ip || "";
}

const sendOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  courseSlug: z.string().min(1).max(200),
});

const confirmSchema = z.object({
  phone: z.string().min(8).max(20),
  courseSlug: z.string().min(1).max(200),
  code: z.string().min(4).max(8),
});

export const interestRouter = Router();

interestRouter.post(
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

    const slug = parsed.data.courseSlug.trim().toLowerCase();
    const course = await Course.findOne({ slug, isActive: true }).lean();
    if (!course) {
      res.status(404).json({ error: "Course not found." });
      return;
    }

    if (course.bookDemoEnabled === true) {
      res.status(400).json({ error: "This program is open for booking — use Book Demo to enroll." });
      return;
    }

    const sms = getSmsSender();
    await createOtpChallenge({
      phoneE164: phone.e164,
      purpose: "interest",
      meta: { courseSlug: slug, courseId: course._id.toString() },
      sms,
      messageBody: (code) =>
        `Little Champ Junior: ${code} is your OTP to join the waitlist. Valid a few minutes. Do not share it.`,
    });

    res.json({
      ok: true,
      resendAfterSeconds: Math.ceil(env.otpTtlMs / 1000),
    });
  }),
);

interestRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const phone = normalizeIndianMobile(parsed.data.phone);
    if (!phone.ok) {
      res.status(400).json({ error: phone.error });
      return;
    }

    const slug = parsed.data.courseSlug.trim().toLowerCase();

    const verified = await verifyOtpChallenge({
      phoneE164: phone.e164,
      purpose: "interest",
      code: parsed.data.code,
    });

    if (!verified.ok) {
      res.status(400).json({ error: verified.error });
      return;
    }

    const metaSlug =
      typeof verified.meta.courseSlug === "string" ? verified.meta.courseSlug.toLowerCase().trim() : "";
    if (!metaSlug || metaSlug !== slug) {
      res.status(400).json({ error: "OTP is for a different program. Start again from the waitlist form." });
      return;
    }

    const course = await Course.findOne({ slug, isActive: true }).lean();
    if (!course) {
      res.status(404).json({ error: "Course not found." });
      return;
    }
    if (course.bookDemoEnabled === true) {
      res.status(400).json({ error: "This program is now open for booking — use Book Demo to enroll." });
      return;
    }

    const ip = clientIp(req);

    try {
      await InterestedUser.create({
        phone: phone.national10,
        course: course._id,
        courseSlug: slug,
        ip,
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: number }).code === 11000
      ) {
        res.status(200).json({
          ok: true,
          message: "We already have your number for this program. We’ll be in touch.",
        });
        return;
      }
      throw e;
    }

    res.status(201).json({
      ok: true,
      message: "You’re on the list. We’ll WhatsApp you when this program opens.",
    });
  }),
);
