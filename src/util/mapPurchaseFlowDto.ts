import { mapPurchaseFlow } from "../services/coursePurchasePricing.js";
import type { CourseLean } from "../routes/coursesShared.js";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

/** Batch row used only to resolve banner date range fallback. */
export type BatchDateRangeDto = { dateRangeLabel: string };

export function mapPurchaseFlowPublicDto(c: CourseLean, batches: BatchDateRangeDto[]) {
  const pf = mapPurchaseFlow(c.purchaseFlow);
  if (!pf) return null;

  const raw = c.purchaseFlow as Record<string, unknown>;
  const batchRange = batches[0]?.dateRangeLabel?.trim() ?? "";
  const dateRangeDisplay = str(raw.dateRangeDisplay) || batchRange || null;

  const featureCards = Array.isArray(raw.featureCards)
    ? raw.featureCards
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const title = str(o.title);
          const description = str(o.description);
          if (!title || !description) return null;
          return {
            iconEmoji: str(o.iconEmoji, "✨"),
            title,
            description,
          };
        })
        .filter(Boolean)
    : [];

  const scheduleBullets = Array.isArray(raw.scheduleBullets)
    ? raw.scheduleBullets.map((b) => String(b).trim()).filter(Boolean)
    : [];

  const detailSections = Array.isArray(raw.detailSections)
    ? raw.detailSections
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const title = str(o.title);
          if (!title) return null;
          const bullets = Array.isArray(o.bullets)
            ? o.bullets.map((b) => String(b).trim()).filter(Boolean)
            : [];
          return {
            emoji: str(o.emoji, "📚"),
            title,
            bullets,
          };
        })
        .filter(Boolean)
    : [];

  const limitedOffers = Array.isArray(raw.limitedOffers)
    ? raw.limitedOffers
        .map((x) => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const label = str(o.label);
          if (!label) return null;
          const crossed =
            typeof o.crossedPricePaise === "number" && Number.isFinite(o.crossedPricePaise)
              ? o.crossedPricePaise
              : null;
          return {
            label,
            crossedPricePaise: crossed,
            crossedPriceRupees: crossed != null ? crossed / 100 : null,
            giftLabel: str(o.giftLabel, "Free"),
          };
        })
        .filter(Boolean)
    : [];

  return {
    enabled: true as const,
    bannerEyebrow: str(raw.bannerEyebrow),
    bannerSubtitle: str(raw.bannerSubtitle),
    previewCardProgramLine: str(raw.previewCardProgramLine, "MASTER PROGRAM"),
    previewCardBadge: str(raw.previewCardBadge, "SCHOOL CURRICULUM"),
    dateLabel: str(raw.dateLabel, "Date"),
    dateRangeDisplay,
    subjectsLabel: str(raw.subjectsLabel, "Subjects"),
    subjects: Array.isArray(raw.subjects) ? raw.subjects.map((s) => String(s)).filter(Boolean) : [],
    shortTagline: str(raw.shortTagline),
    emiAvailableCopy: str(raw.emiAvailableCopy, "EMI available"),
    scheduleHeading: str(raw.scheduleHeading, "Class schedule"),
    featureCards,
    scheduleBullets,
    detailSections,
    limitedOffers,
  };
}
