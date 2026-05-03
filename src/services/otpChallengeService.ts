import { OtpChallenge, type OtpPurpose } from "../models/OtpChallenge.js";
import { env } from "../env.js";
import { generateNumericOtp, hashOtpCode } from "../util/otpHash.js";
import type { SmsSender } from "./sms/smsSender.js";

const MAX_ATTEMPTS = 5;

export async function createOtpChallenge(params: {
  phoneE164: string;
  purpose: OtpPurpose;
  meta?: Record<string, unknown>;
  sms: SmsSender;
  messageBody: (code: string) => string;
}): Promise<void> {
  await OtpChallenge.updateMany(
    { phoneE164: params.phoneE164, purpose: params.purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const code = generateNumericOtp(6);
  const expiresAt = new Date(Date.now() + env.otpTtlMs);
  await OtpChallenge.create({
    phoneE164: params.phoneE164,
    codeHash: hashOtpCode(code),
    expiresAt,
    attempts: 0,
    purpose: params.purpose,
    meta: params.meta ?? {},
    consumedAt: null,
  });
  await params.sms.send({
    toE164: params.phoneE164,
    body: params.messageBody(code),
  });
}

export async function verifyOtpChallenge(params: {
  phoneE164: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ ok: true; meta: Record<string, unknown> } | { ok: false; error: string }> {
  const code = params.code.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit OTP." };
  }

  const challenge = await OtpChallenge.findOne({
    phoneE164: params.phoneE164,
    purpose: params.purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!challenge) {
    return { ok: false, error: "OTP expired or not found. Request a new code." };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new OTP." };
  }

  const match = challenge.codeHash === hashOtpCode(code);

  if (!match) {
    await OtpChallenge.updateOne(
      { _id: challenge._id },
      { $inc: { attempts: 1 } },
    );
    return { ok: false, error: "Invalid OTP." };
  }

  await OtpChallenge.updateOne(
    { _id: challenge._id },
    { $set: { consumedAt: new Date() } },
  );

  const meta =
    challenge.meta && typeof challenge.meta === "object" && !Array.isArray(challenge.meta)
      ? (challenge.meta as Record<string, unknown>)
      : {};

  return { ok: true, meta };
}
