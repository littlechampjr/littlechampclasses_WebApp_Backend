import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "../env.js";

export function getRazorpay(): Razorpay | null {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    return null;
  }
  return new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret,
  });
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!env.razorpayKeySecret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", env.razorpayKeySecret).update(body).digest("hex");
  if (expected.length !== signature.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

/** Razorpay webhook body signature (X-Razorpay-Signature). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!env.razorpayWebhookSecret || !signatureHeader) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", env.razorpayWebhookSecret)
    .update(rawBody)
    .digest("hex");
  if (expected.length !== signatureHeader.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signatureHeader, "utf8"));
  } catch {
    return false;
  }
}
