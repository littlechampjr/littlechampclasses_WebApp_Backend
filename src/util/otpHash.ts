import { createHash } from "crypto";
import { env } from "../env.js";

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(`${env.otpPepper}:${code.trim()}`).digest("hex");
}

export function generateNumericOtp(length = 6): string {
  const n = Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1));
  return String(n).padStart(length, "0");
}
