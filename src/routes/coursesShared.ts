import type { Types } from "mongoose";

/** Lean course row shape used across course listing/detail/purchase handlers. */
export type CourseLean = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  detailDescription?: string;
  track: string;
  pricePaise: number;
  compareAtPricePaise?: number | null;
  liveSessionsFirst?: number;
  liveSessionsSecond?: number;
  isDemo: boolean;
  previewVideoUrl?: string;
  thumbnailUrl?: string;
  marketingTitle?: string;
  marketingBullets?: string[];
  classStartsAt?: Date | null;
  isActive: boolean;
  bookDemoEnabled?: boolean;
  purchaseFlow?: unknown;
};

export function programTitleFromCourse(c: Pick<CourseLean, "title" | "marketingTitle">): string {
  return (
    c.marketingTitle?.trim() ||
    c.title.replace(/\s*\(demo\)\s*$/i, "").trim()
  );
}
