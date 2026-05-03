import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";
import { User } from "../models/User.js";
import { createOtpChallenge, verifyOtpChallenge } from "../services/otpChallengeService.js";
import { getSmsSender } from "../services/sms/getSmsSender.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { normalizeIndianMobile } from "../util/phone.js";
import { rateLimit } from "../compat/vendorMiddleware.js";
import type { UserDoc } from "../models/User.js";

export const authRouter = Router();

const sendOtpSchema = z.object({
  phone: z.string().min(8).max(20),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(8),
});

/** Stricter: SMS abuse prevention (NIST/OWASP-style). */
const sendOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please try again later." },
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again later." },
});

function signToken(userId: string, phoneE164: string) {
  return jwt.sign({ sub: userId, phone: phoneE164 }, env.jwtSecret, { expiresIn: "14d" });
}

export function publicUserResponse(user: UserDoc | Record<string, unknown>) {
  const u = user as {
    _id: { toString: () => string };
    phoneE164: string;
    childName?: string;
    learningGoal?: string;
    childGrade?: number | null;
    profileComplete?: boolean;
    createdAt?: Date;
  };
  const e164 = String(u.phoneE164 ?? "");
  const national10 = e164.replace(/^\+91/, "");
  return {
    id: u._id.toString(),
    phoneE164: e164,
    phoneNational10: national10,
    childName: typeof u.childName === "string" ? u.childName : "",
    learningGoal: typeof u.learningGoal === "string" ? u.learningGoal : "School Curriculum",
    childGrade: u.childGrade === null || u.childGrade === undefined ? null : Number(u.childGrade),
    profileComplete: Boolean(u.profileComplete),
    createdAt: u.createdAt ? u.createdAt.toISOString() : undefined,
  };
}

authRouter.post(
  "/send-otp",
  sendOtpLimiter,
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
    const sms = getSmsSender();
    await createOtpChallenge({
      phoneE164: phone.e164,
      purpose: "login",
      sms,
      messageBody: (code) =>
        `Little Champ Junior: ${code} is your login OTP. Valid for a few minutes. Do not share it.`,
    });
    res.json({
      ok: true,
      resendAfterSeconds: Math.ceil(env.otpTtlMs / 1000),
    });
  }),
);

authRouter.post(
  "/verify-otp",
  verifyOtpLimiter,
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
      purpose: "login",
      code: parsed.data.code,
    });
    if (!verified.ok) {
      res.status(400).json({ error: verified.error });
      return;
    }
    let user = await User.findOne({ phoneE164: phone.e164 });
    if (!user) {
      user = await User.create({
        phoneE164: phone.e164,
        childName: "",
        learningGoal: "School Curriculum",
        profileComplete: false,
      });
    }
    const token = signToken(user._id.toString(), user.phoneE164);
    res.json({
      token,
      user: publicUserResponse(user),
      needsOnboarding: !user.profileComplete,
    });
  }),
);
