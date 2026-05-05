import type { Request, Response } from "express";
import { z } from "zod";
import type { Types } from "mongoose";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { CoursePurchase } from "../models/CoursePurchase.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import {
  buildListAndStrikePaise,
  computeCouponDiscountPaise,
  finalAmountAfterCoupon,
  findCouponDef,
  mapPurchaseFlow,
  payableBeforeCouponPaise,
} from "../services/coursePurchasePricing.js";
import { getRazorpay, verifyPaymentSignature } from "../services/razorpayService.js";
import { env } from "../env.js";
import { formatBatchDateRange } from "../util/bookDemoHeading.js";
import { programTitleFromCourse, type CourseLean } from "./coursesShared.js";

const validateCouponBody = z.object({
  code: z.string().min(1).max(64),
});

const createOrderBody = z.object({
  batchId: z.string().min(1).max(64),
  couponCode: z.string().min(1).max(64).optional().nullable(),
});

const verifyBody = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

async function loadCourseForPurchase(slug: string): Promise<CourseLean | null> {
  const c = await Course.findOne({ slug, isActive: true }).lean();
  return c as CourseLean | null;
}

export async function getCoursePurchasePricing(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  const course = await loadCourseForPurchase(slug);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const pf = mapPurchaseFlow(course.purchaseFlow);
  if (!pf) {
    res.status(404).json({ error: "Purchase flow is not enabled for this course" });
    return;
  }

  const user = await User.findById(req.userId).lean();
  const userDisc = Math.max(0, user?.coursePurchaseDiscountPaise ?? 0);
  const { listPricePaise, strikePricePaise } = buildListAndStrikePaise(course);
  const basePayable = payableBeforeCouponPaise(course, userDisc);

  const batchMapCourse = await loadDefaultBatch(course);
  const dateRangeDisplay =
    (typeof pf.dateRangeDisplay === "string" && pf.dateRangeDisplay.trim()) ||
    batchMapCourse.dateRangeLabel ||
    "";

  res.json({
    courseId: course._id.toString(),
    slug: course.slug,
    listPricePaise,
    strikePricePaise,
    salePricePaise: course.pricePaise,
    userAdjustmentPaise: userDisc,
    basePayablePaise: basePayable,
    currency: "INR",
    defaultBatchId: batchMapCourse.batchId,
    dateRangeDisplay,
    emiCopy:
      typeof pf.emiAvailableCopy === "string" && pf.emiAvailableCopy.trim()
        ? pf.emiAvailableCopy.trim()
        : "EMI available",
  });
}

type BatchPick = { batchId: string; dateRangeLabel: string };

async function loadDefaultBatch(course: CourseLean): Promise<BatchPick> {
  const pf = mapPurchaseFlow(course.purchaseFlow);
  const cid = course._id as Types.ObjectId;
  const first = await CourseBatch.findOne({ course: cid, isActive: true }).sort({
    sortOrder: 1,
    startsAt: 1,
  });
  if (!first) {
    return {
      batchId: "",
      dateRangeLabel:
        typeof pf?.dateRangeDisplay === "string" ? pf.dateRangeDisplay.trim() : "",
    };
  }
  const s = new Date(first.startsAt);
  const e = new Date(first.endsAt);
  return {
    batchId: first._id.toString(),
    dateRangeLabel: formatBatchDateRange(s, e),
  };
}

export async function postValidateCourseCoupon(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  const parsed = validateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const course = await loadCourseForPurchase(slug);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const pf = mapPurchaseFlow(course.purchaseFlow);
  if (!pf) {
    res.status(404).json({ error: "Purchase flow is not enabled for this course" });
    return;
  }

  const user = await User.findById(req.userId).lean();
  const userDisc = Math.max(0, user?.coursePurchaseDiscountPaise ?? 0);
  const basePayable = payableBeforeCouponPaise(course, userDisc);

  const def = findCouponDef(pf, parsed.data.code);
  if (!def) {
    res.status(400).json({ error: "Invalid or inactive coupon code" });
    return;
  }

  const couponDiscountPaise = computeCouponDiscountPaise(def, basePayable);
  const finalAmountPaise = finalAmountAfterCoupon(basePayable, couponDiscountPaise);

  res.json({
    ok: true,
    code: def.code,
    label: def.label,
    couponDiscountPaise,
    finalAmountPaise,
    basePayablePaise: basePayable,
  });
}

export async function getCourseCouponCatalog(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  const course = await loadCourseForPurchase(slug);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const pf = mapPurchaseFlow(course.purchaseFlow);
  if (!pf) {
    res.status(404).json({ error: "Purchase flow is not enabled for this course" });
    return;
  }
  const items = (pf.coupons ?? [])
    .filter((c) => c.active !== false)
    .map((c) => ({ code: c.code, label: c.label }));
  res.json({ items });
}

export async function postCreateCoursePurchaseOrder(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  const parsed = createOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const course = await loadCourseForPurchase(slug);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const pf = mapPurchaseFlow(course.purchaseFlow);
  if (!pf) {
    res.status(404).json({ error: "Purchase flow is not enabled for this course" });
    return;
  }

  const batch = await CourseBatch.findOne({
    _id: parsed.data.batchId,
    course: course._id,
    isActive: true,
  }).lean();
  if (!batch) {
    res.status(400).json({ error: "Invalid batch for this course" });
    return;
  }

  const user = await User.findById(req.userId).lean();
  const userDisc = Math.max(0, user?.coursePurchaseDiscountPaise ?? 0);
  const { listPricePaise, strikePricePaise } = buildListAndStrikePaise(course);
  const basePayable = payableBeforeCouponPaise(course, userDisc);

  let couponCode: string | null = null;
  let couponDiscountPaise = 0;
  const rawCoupon = parsed.data.couponCode?.trim();
  if (rawCoupon) {
    const def = findCouponDef(pf, rawCoupon);
    if (!def) {
      res.status(400).json({ error: "Invalid or inactive coupon code" });
      return;
    }
    couponDiscountPaise = computeCouponDiscountPaise(def, basePayable);
    couponCode = def.code;
  }

  const amountPaise = finalAmountAfterCoupon(basePayable, couponDiscountPaise);

  const rz = getRazorpay();
  if (!rz) {
    res.status(503).json({
      error: "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    });
    return;
  }

  const purchase = await CoursePurchase.create({
    user: req.userId,
    course: course._id,
    batch: batch._id,
    listPricePaise,
    strikePricePaise,
    baseSalePaise: course.pricePaise,
    userAdjustmentPaise: userDisc,
    couponCode,
    couponDiscountPaise,
    amountPaise,
    currency: "INR",
    status: "pending",
  });

  const receipt = `cp_${purchase._id.toString().slice(-20)}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const order = await rz.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: receipt.slice(0, 40),
    notes: {
      coursePurchaseId: purchase._id.toString(),
      courseId: course._id.toString(),
      userId: req.userId!,
    },
  });

  purchase.razorpayOrderId = order.id;
  await purchase.save();

  res.json({
    keyId: env.razorpayKeyId,
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    purchaseId: purchase._id.toString(),
    courseTitle: programTitleFromCourse(course),
    batchCode: batch.code,
  });
}

export async function postVerifyCoursePurchasePayment(req: Request, res: Response): Promise<void> {
  const parsed = verifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    res.status(400).json({ error: "Invalid payment signature" });
    return;
  }

  const purchase = await CoursePurchase.findOne({ razorpayOrderId: razorpay_order_id });
  if (!purchase) {
    res.status(404).json({ error: "Purchase not found for this order" });
    return;
  }

  if (String(purchase.user) !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (purchase.status === "paid") {
    res.json({ ok: true, alreadyPaid: true, purchaseId: purchase._id.toString() });
    return;
  }

  purchase.razorpayPaymentId = razorpay_payment_id;
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

  res.json({ ok: true, purchaseId: purchase._id.toString() });
}
