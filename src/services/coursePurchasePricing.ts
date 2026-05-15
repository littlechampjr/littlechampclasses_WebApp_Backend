export type PurchaseFlowLean = {
  enabled: true;
  coupons?: CouponDef[];
} & Record<string, unknown>;

const MIN_PAYABLE_PAISE = 100; // ₹1 — practical floor for checkout

export type CouponDef = {
  code: string;
  label: string;
  discountPaise: number | null;
  discountPercent: number | null;
  active: boolean;
  expiresAt?: Date | null;
  maxRedemptions?: number | null;
  notes?: string;
};

type CoursePriceFields = {
  pricePaise: number;
  compareAtPricePaise?: number | null;
};

export function mapPurchaseFlow(flow: unknown): PurchaseFlowLean | null {
  if (!flow || typeof flow !== "object") return null;
  const f = flow as Record<string, unknown>;
  if (f.enabled !== true) return null;
  return flow as PurchaseFlowLean;
}

export function buildListAndStrikePaise(course: CoursePriceFields): {
  listPricePaise: number;
  strikePricePaise: number | null;
} {
  const sale = course.pricePaise;
  const cmp = course.compareAtPricePaise ?? null;
  if (cmp != null && cmp > sale) {
    return { listPricePaise: cmp, strikePricePaise: cmp };
  }
  return { listPricePaise: sale, strikePricePaise: null };
}

export function payableBeforeCouponPaise(course: CoursePriceFields, userDiscountPaise: number): number {
  const sale = course.pricePaise;
  const adjusted = Math.max(0, sale - Math.max(0, userDiscountPaise));
  return Math.max(MIN_PAYABLE_PAISE, adjusted);
}

export function findCouponDef(flow: PurchaseFlowLean, rawCode: string): CouponDef | null {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const list = flow.coupons ?? [];
  const hit = list.find((c) => {
    const active = (c as { active?: boolean }).active;
    const isActive = active !== false;
    return isActive && String((c as { code?: string }).code ?? "").toUpperCase() === code;
  });
  if (!hit) return null;
  const row = hit as Record<string, unknown>;
  return {
    code: String(row.code ?? "").toUpperCase(),
    label: String(row.label ?? ""),
    discountPaise:
      typeof row.discountPaise === "number" && Number.isFinite(row.discountPaise)
        ? row.discountPaise
        : null,
    discountPercent:
      typeof row.discountPercent === "number" && Number.isFinite(row.discountPercent)
        ? row.discountPercent
        : null,
    active: row.active !== false,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt : row.expiresAt ? new Date(String(row.expiresAt)) : null,
    maxRedemptions:
      typeof row.maxRedemptions === "number" && Number.isFinite(row.maxRedemptions)
        ? row.maxRedemptions
        : null,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function computeCouponDiscountPaise(def: CouponDef, basePaise: number): number {
  let d = 0;
  if (def.discountPaise != null && def.discountPaise > 0) {
    d = def.discountPaise;
  } else if (def.discountPercent != null && def.discountPercent > 0) {
    d = Math.round((basePaise * def.discountPercent) / 100);
  }
  return Math.min(Math.max(0, d), Math.max(0, basePaise - MIN_PAYABLE_PAISE));
}

export function finalAmountAfterCoupon(basePaise: number, couponDiscountPaise: number): number {
  return Math.max(MIN_PAYABLE_PAISE, basePaise - Math.max(0, couponDiscountPaise));
}
