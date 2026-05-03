import type { Types } from "mongoose";
import { Router } from "express";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { buildBookDemoHeading, formatBatchDateRange } from "../util/bookDemoHeading.js";

export const coursesRouter = Router();

/** Homepage “Pick a program” strip — order preserved. */
const HOME_FEATURED_SLUGS = [
  "after-school-spark-demo",
  "learn-english-demo",
  "learn-maths-demo",
] as const;

type CourseLean = {
  _id: { toString: () => string };
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
};

type BatchLean = {
  _id: Types.ObjectId;
  code: string;
  startsAt: Date;
  endsAt: Date;
};

export type CourseBatchDto = {
  id: string;
  code: string;
  startsAt: string;
  endsAt: string;
  dateRangeLabel: string;
  /** Heading with grade defaulting to 1 (first class band). */
  bookingHeadingDefault: string;
};

function programTitleFromCourse(c: CourseLean): string {
  return (
    c.marketingTitle?.trim() ||
    c.title.replace(/\s*\(demo\)\s*$/i, "").trim()
  );
}

function mapBatchesForCourse(programTitle: string, batches: BatchLean[]): CourseBatchDto[] {
  return batches.map((b) => {
    const startsAt = new Date(b.startsAt);
    const endsAt = new Date(b.endsAt);
    return {
      id: b._id.toString(),
      code: b.code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      dateRangeLabel: formatBatchDateRange(startsAt, endsAt),
      bookingHeadingDefault: buildBookDemoHeading(programTitle, 1, b.code, startsAt, endsAt),
    };
  });
}

async function loadBatchesGrouped(
  courseIds: Types.ObjectId[],
): Promise<Map<string, BatchLean[]>> {
  if (courseIds.length === 0) {
    return new Map();
  }
  const list = await CourseBatch.find({
    course: { $in: courseIds },
    isActive: true,
  })
    .sort({ sortOrder: 1, startsAt: 1 })
    .lean();
  const map = new Map<string, BatchLean[]>();
  for (const row of list) {
    const k = String(row.course);
    const arr = map.get(k);
    const b: BatchLean = {
      _id: row._id,
      code: row.code,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
    if (arr) {
      arr.push(b);
    } else {
      map.set(k, [b]);
    }
  }
  return map;
}

function mapCourse(c: CourseLean, batches: CourseBatchDto[]) {
  const first = c.liveSessionsFirst ?? 6;
  const second = c.liveSessionsSecond ?? 6;
  const bullets =
    c.marketingBullets?.filter((b) => b?.trim()).slice(0, 4) ?? [];
  const marketingBullets =
    bullets.length > 0
      ? bullets
      : [
          `Program: ${first} + ${second} live sessions (${first + second} classes)`,
          `Demo booking: ₹${c.pricePaise / 100}`,
          "Small groups · IIT-trained mentors",
          "Ages 1–8 · paced batches",
        ];
  const marketingTitle =
    c.marketingTitle?.trim() ||
    c.title.replace(/\s*\(demo\)\s*$/i, "").trim();

  const compareAt = c.compareAtPricePaise ?? null;

  return {
    id: c._id.toString(),
    title: c.title,
    slug: c.slug,
    description: c.description,
    detailDescription: c.detailDescription ?? "",
    track: c.track,
    pricePaise: c.pricePaise,
    priceRupees: c.pricePaise / 100,
    compareAtPricePaise: compareAt,
    compareAtPriceRupees: compareAt != null ? compareAt / 100 : null,
    liveSessionsFirst: first,
    liveSessionsSecond: second,
    totalLiveSessions: first + second,
    isDemo: c.isDemo,
    previewVideoUrl: c.previewVideoUrl ?? "",
    thumbnailUrl: c.thumbnailUrl ?? "",
    marketingTitle,
    marketingBullets,
    classStartsAt: c.classStartsAt ?? null,
    isActive: c.isActive,
    bookDemoEnabled: c.bookDemoEnabled === true,
    batches,
  };
}

coursesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
  /** Query ?featured=1 avoids /featured being eaten by /:slug as slug "featured" (older builds / ordering). */
  const wantFeatured =
    req.query.featured === "1" ||
    req.query.featured === "true" ||
    req.query.home === "1";

  if (wantFeatured) {
    const found = await Course.find({
      slug: { $in: [...HOME_FEATURED_SLUGS] },
      isActive: true,
    }).lean();
    const bySlug = new Map(found.map((doc) => [doc.slug, doc]));
    const ordered = HOME_FEATURED_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean) as CourseLean[];
    const ids = ordered.map((c) => c._id as Types.ObjectId);
    const batchMap = await loadBatchesGrouped(ids);
    res.json({
      courses: ordered.map((c) => {
        const programTitle = programTitleFromCourse(c);
        const raw = batchMap.get(c._id.toString()) ?? [];
        const batches = mapBatchesForCourse(programTitle, raw);
        return mapCourse(c, batches);
      }),
    });
    return;
  }

  const list = await Course.find({ isActive: true }).sort({ track: 1, title: 1 }).lean();
  res.json({ courses: list.map((c) => mapCourse(c as CourseLean, [])) });
  }),
);

coursesRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
  const c = await Course.findOne({ slug: req.params.slug, isActive: true }).lean();
  if (!c) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const cl = c as CourseLean;
  const batchMap = await loadBatchesGrouped([c._id as Types.ObjectId]);
  const programTitle = programTitleFromCourse(cl);
  const raw = batchMap.get(c._id.toString()) ?? [];
  const batches = mapBatchesForCourse(programTitle, raw);
  res.json({ course: mapCourse(cl, batches) });
  }),
);
