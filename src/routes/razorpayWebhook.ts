import type { RequestHandler } from "express";
import { BookDemoEnrollment } from "../models/BookDemoEnrollment.js";
import { CoursePurchase } from "../models/CoursePurchase.js";
import { Enrollment } from "../models/Enrollment.js";
import { verifyWebhookSignature } from "../services/razorpayService.js";

type RazorpayWebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: { order_id?: string; id?: string; status?: string } };
  };
};

export const razorpayWebhookHandler: RequestHandler = async (req, res) => {
  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body ?? {});

  const sig = req.headers["x-razorpay-signature"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;

  if (!verifyWebhookSignature(raw, sigStr)) {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  let parsed: RazorpayWebhookBody;
  try {
    parsed = JSON.parse(raw) as RazorpayWebhookBody;
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event = parsed.event;
  const orderId = parsed.payload?.payment?.entity?.order_id;
  const paymentId = parsed.payload?.payment?.entity?.id;
  const status = parsed.payload?.payment?.entity?.status;

  if (
    (event === "payment.captured" || event === "order.paid") &&
    orderId &&
    paymentId &&
    status === "captured"
  ) {
    const enrollment = await BookDemoEnrollment.findOne({ razorpayOrderId: orderId });
    if (enrollment && enrollment.status !== "paid") {
      enrollment.razorpayPaymentId = paymentId;
      enrollment.paymentRef = paymentId;
      enrollment.status = "paid";
      await enrollment.save();
    }

    const purchase = await CoursePurchase.findOne({ razorpayOrderId: orderId });
    if (purchase && purchase.status !== "paid") {
      purchase.razorpayPaymentId = paymentId;
      purchase.status = "paid";
      await purchase.save();
      await Enrollment.updateOne(
        { user: purchase.user, batch: purchase.batch },
        {
          $setOnInsert: {
            user: purchase.user,
            batch: purchase.batch,
            status: "active",
            source: "program",
            purchasedAt: new Date(),
            bookDemoEnrollment: null,
          },
        },
        { upsert: true },
      );
    }
  }

  res.json({ received: true });
};
