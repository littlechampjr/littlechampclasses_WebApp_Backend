import type { Types } from "mongoose";
import { CoursePurchase } from "../models/CoursePurchase.js";
import type { CouponDef } from "./coursePurchasePricing.js";

export function isCouponExpired(def: CouponDef, now = new Date()): boolean {
  const raw = def.expiresAt;
  if (!raw) return false;
  const exp = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(exp.getTime()) ? false : now.getTime() > exp.getTime();
}

export async function countPaidCouponUses(
  courseId: Types.ObjectId,
  code: string,
): Promise<number> {
  const normalized = code.trim().toUpperCase();
  return CoursePurchase.countDocuments({
    course: courseId,
    couponCode: normalized,
    status: "paid",
  });
}

/** Returns human-readable block reason or null when coupon can be used. */
export async function couponBlockReason(
  courseId: Types.ObjectId,
  def: CouponDef,
  now = new Date(),
): Promise<string | null> {
  if (isCouponExpired(def, now)) return "Coupon expired";
  const max = def.maxRedemptions;
  if (max != null && max >= 1) {
    const used = await countPaidCouponUses(courseId, def.code);
    if (used >= max) return "Coupon usage limit reached";
  }
  return null;
}
