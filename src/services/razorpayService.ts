import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "../env.js";

export const MIN_RAZORPAY_AMOUNT_PAISE = 100;

export class RazorpayServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "RazorpayServiceError";
  }
}

export function getRazorpay(): Razorpay | null {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    return null;
  }
  return new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret,
  });
}

type RazorpayApiError = {
  statusCode?: number;
  error?: { code?: string; description?: string };
};

function isRazorpayAuthError(err: unknown): boolean {
  const e = err as RazorpayApiError;
  if (e?.statusCode === 401) return true;
  const code = e?.error?.code?.toUpperCase();
  const desc = (e?.error?.description ?? "").toLowerCase();
  return (
    code === "BAD_REQUEST_ERROR" &&
    (desc.includes("authentication") ||
      desc.includes("invalid key") ||
      desc.includes("key_id") ||
      desc.includes("key_secret"))
  );
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string }> {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise < MIN_RAZORPAY_AMOUNT_PAISE) {
    throw new RazorpayServiceError(
      `Amount must be at least ${MIN_RAZORPAY_AMOUNT_PAISE} paise.`,
      400,
    );
  }

  const rz = getRazorpay();
  if (!rz) {
    throw new RazorpayServiceError(
      "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      503,
    );
  }

  try {
    const order = await rz.orders.create({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt.slice(0, 40),
      notes: params.notes,
    });
    return { id: order.id };
  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    if (isRazorpayAuthError(err)) {
      throw new RazorpayServiceError("Razorpay authentication failed.", 401);
    }
    throw new RazorpayServiceError("Payment provider error.", 500);
  }
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
