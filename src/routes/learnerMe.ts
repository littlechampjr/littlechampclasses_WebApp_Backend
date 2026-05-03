import { addDays } from "date-fns";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ClassSession } from "../models/ClassSession.js";
import { Enrollment } from "../models/Enrollment.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { formatBatchDateRange } from "../util/bookDemoHeading.js";
import {
  dayMonthLabelInTz,
  durationLabel,
  timeHmInTz,
  todayYmd,
  weekRangeUtcFromMondayContaining,
  ymdInTz,
  zonedDayEndExclusiveUtc,
  zonedDayStartUtc,
  weekdayShortInTz,
} from "../util/scheduleTime.js";

export const learnerMeRouter = Router();

type CourseLean = {
  _id: mongoose.Types.ObjectId;
  title: string;
  marketingTitle?: string;
};

type BatchLean = {
  _id: mongoose.Types.ObjectId;
  code: string;
  startsAt: Date;
  endsAt: Date;
  course?: CourseLean;
};

type EnrollmentLean = {
  _id: mongoose.Types.ObjectId;
  purchasedAt: Date;
  batch: BatchLean;
};

function programTitleFromCourse(course: CourseLean | undefined): string {
  if (!course) return "Program";
  const t = (course.marketingTitle ?? "").trim();
  if (t) return t;
  return String(course.title ?? "").replace(/\s*\(demo\)\s*$/i, "").trim() || "Program";
}

function mapSessionDto(s: {
  _id: mongoose.Types.ObjectId;
  title: string;
  subject: string;
  startsAt: Date;
  durationMinutes: number;
  teacherName?: string;
  teacherImageUrl?: string;
  statusMicrocopy?: string;
  hasAttachments?: boolean;
}) {
  const tz = env.scheduleTz;
  const ymdToday = todayYmd(tz);
  const ymdSession = ymdInTz(s.startsAt, tz);
  const ymdTomorrow = ymdInTz(addDays(zonedDayStartUtc(ymdToday, tz), 1), tz);
  const isTomorrow = ymdSession === ymdTomorrow;
  return {
    id: s._id.toString(),
    title: s.title,
    subject: s.subject,
    startsAt: s.startsAt.toISOString(),
    startsAtLabel: timeHmInTz(s.startsAt, tz),
    durationMinutes: s.durationMinutes,
    durationLabel: durationLabel(s.durationMinutes),
    teacherName: s.teacherName ?? "",
    teacherImageUrl: s.teacherImageUrl ?? "",
    statusMicrocopy: s.statusMicrocopy ?? "",
    hasAttachments: Boolean(s.hasAttachments),
    scheduleDateYmd: ymdSession,
    dayLabel: `${dayMonthLabelInTz(s.startsAt, tz)} · ${weekdayShortInTz(s.startsAt, tz)}`,
    isTomorrow,
  };
}

function pickDefaultBatchId(enrollments: EnrollmentLean[], tz: string): string | null {
  if (enrollments.length === 0) return null;
  const ymdToday = todayYmd(tz);
  const todayStart = zonedDayStartUtc(ymdToday, tz);

  const decorated = enrollments.map((e) => ({
    e,
    endsAt: new Date(e.batch.endsAt),
    purchasedAt: new Date(e.purchasedAt),
  }));

  const active = decorated.filter((x) => x.endsAt.getTime() >= todayStart.getTime());
  const pool = active.length > 0 ? active : decorated;
  pool.sort((a, b) => {
    const p = b.purchasedAt.getTime() - a.purchasedAt.getTime();
    if (p !== 0) return p;
    return b.endsAt.getTime() - a.endsAt.getTime();
  });
  return pool[0]?.e.batch._id.toString() ?? null;
}

learnerMeRouter.get(
  "/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tz = env.scheduleTz;
    const ymdToday = todayYmd(tz);
    const batchIdQuery =
      typeof req.query.batchId === "string" && mongoose.isValidObjectId(req.query.batchId)
        ? req.query.batchId
        : null;

    const enrollmentsRaw = await Enrollment.find({
      user: req.userId,
      status: "active",
    })
      .populate({ path: "batch", populate: { path: "course" } })
      .sort({ purchasedAt: -1 })
      .lean();

    const enrollments = enrollmentsRaw as unknown as EnrollmentLean[];
    const hasPurchases = enrollments.length > 0;
    const defaultBatchId = pickDefaultBatchId(enrollments, tz);

    let effectiveBatchId = defaultBatchId;
    if (batchIdQuery) {
      const allowed = enrollments.some((e) => e.batch._id.toString() === batchIdQuery);
      if (allowed) effectiveBatchId = batchIdQuery;
    }

    let todaySessions: ReturnType<typeof mapSessionDto>[] = [];
    let upcomingSessions: ReturnType<typeof mapSessionDto>[] = [];
    if (effectiveBatchId) {
      const batchOid = new mongoose.Types.ObjectId(effectiveBatchId);
      const t0 = zonedDayStartUtc(ymdToday, tz);
      const t1 = zonedDayEndExclusiveUtc(ymdToday, tz);
      const sessions = await ClassSession.find({
        batch: batchOid,
        startsAt: { $gte: t0, $lt: t1 },
      })
        .sort({ startsAt: 1, sortOrder: 1 })
        .lean();

      todaySessions = sessions.map((s) =>
        mapSessionDto({
          _id: s._id,
          title: s.title,
          subject: s.subject,
          startsAt: s.startsAt,
          durationMinutes: s.durationMinutes,
          teacherName: s.teacherName,
          teacherImageUrl: s.teacherImageUrl,
          statusMicrocopy: s.statusMicrocopy,
          hasAttachments: s.hasAttachments,
        }),
      );

      const upcomingStart = zonedDayEndExclusiveUtc(ymdToday, tz);
      const upcomingEnd = addDays(upcomingStart, 7);
      const upcomingRows = await ClassSession.find({
        batch: batchOid,
        startsAt: { $gte: upcomingStart, $lt: upcomingEnd },
      })
        .sort({ startsAt: 1, sortOrder: 1 })
        .limit(50)
        .lean();

      upcomingSessions = upcomingRows.map((s) =>
        mapSessionDto({
          _id: s._id,
          title: s.title,
          subject: s.subject,
          startsAt: s.startsAt,
          durationMinutes: s.durationMinutes,
          teacherName: s.teacherName,
          teacherImageUrl: s.teacherImageUrl,
          statusMicrocopy: s.statusMicrocopy,
          hasAttachments: s.hasAttachments,
        }),
      );
    }

    const enrollmentDtos = enrollments.map((e) => {
      const b = e.batch;
      const c = b.course;
      const startsAt = new Date(b.startsAt);
      const endsAt = new Date(b.endsAt);
      return {
        enrollmentId: e._id.toString(),
        batchId: b._id.toString(),
        courseId: c?._id.toString() ?? "",
        courseTitle: programTitleFromCourse(c),
        batchCode: b.code,
        dateRangeLabel: formatBatchDateRange(startsAt, endsAt),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        purchasedAt: new Date(e.purchasedAt).toISOString(),
      };
    });

    const { mondayYmd } = weekRangeUtcFromMondayContaining(ymdToday, tz);

    res.json({
      hasPurchases,
      enrollments: enrollmentDtos,
      defaultBatchId,
      selectedBatchId: effectiveBatchId,
      todaySessions,
      upcomingSessions,
      weekHints: {
        todayYmd: ymdToday,
        weekMondayYmd: mondayYmd,
      },
    });
  }),
);

const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

learnerMeRouter.get(
  "/batches/:batchId/schedule",
  requireAuth,
  asyncHandler(async (req, res) => {
    const tz = env.scheduleTz;
    const { batchId } = req.params;
    if (!mongoose.isValidObjectId(batchId)) {
      res.status(400).json({ error: "Invalid batch id" });
      return;
    }

    const enrolled = await Enrollment.findOne({
      user: req.userId,
      batch: batchId,
      status: "active",
    })
      .lean();
    if (!enrolled) {
      res.status(403).json({ error: "Not enrolled in this batch" });
      return;
    }

    const parsed = weekStartSchema.safeParse(
      typeof req.query.weekStart === "string" ? req.query.weekStart : undefined,
    );
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid weekStart (use YYYY-MM-DD)" });
      return;
    }

    const weekOffsetRaw = req.query.weekOffset;
    const weekOffsetParsed =
      typeof weekOffsetRaw === "string" && /^-?\d+$/.test(weekOffsetRaw.trim())
        ? Number(weekOffsetRaw.trim())
        : 0;

    let anchorYmd: string;
    if (parsed.data) {
      anchorYmd = parsed.data;
    } else {
      const shifted = addDays(zonedDayStartUtc(todayYmd(tz), tz), weekOffsetParsed * 7);
      anchorYmd = ymdInTz(shifted, tz);
    }

    const { weekStartUtc, weekEndExclusiveUtc, mondayYmd } = weekRangeUtcFromMondayContaining(
      anchorYmd,
      tz,
    );

    const sessions = await ClassSession.find({
      batch: new mongoose.Types.ObjectId(batchId),
      startsAt: { $gte: weekStartUtc, $lt: weekEndExclusiveUtc },
    })
      .sort({ startsAt: 1, sortOrder: 1 })
      .lean();

    const byYmd = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const key = ymdInTz(s.startsAt, tz);
      const arr = byYmd.get(key);
      if (arr) arr.push(s);
      else byYmd.set(key, [s]);
    }

    const ymdToday = todayYmd(tz);
    const todayStartMs = zonedDayStartUtc(ymdToday, tz).getTime();

    const days: {
      ymd: string;
      dateLabel: string;
      weekdayShort: string;
      relativeLabel?: "Yesterday" | "Today" | "Tomorrow";
      sessions: ReturnType<typeof mapSessionDto>[];
    }[] = [];

    let cursor = weekStartUtc;
    for (let i = 0; i < 7; i += 1) {
      const ymd = ymdInTz(cursor, tz);
      const dayStartZ = zonedDayStartUtc(ymd, tz);
      const diffDays = Math.round((dayStartZ.getTime() - todayStartMs) / 86400000);
      let relativeLabel: "Yesterday" | "Today" | "Tomorrow" | undefined;
      if (diffDays === 0) relativeLabel = "Today";
      else if (diffDays === -1) relativeLabel = "Yesterday";
      else if (diffDays === 1) relativeLabel = "Tomorrow";

      const list = byYmd.get(ymd) ?? [];
      days.push({
        ymd,
        dateLabel: dayMonthLabelInTz(dayStartZ, tz),
        weekdayShort: weekdayShortInTz(dayStartZ, tz),
        relativeLabel,
        sessions: list.map((row) =>
          mapSessionDto({
            _id: row._id,
            title: row.title,
            subject: row.subject,
            startsAt: row.startsAt,
            durationMinutes: row.durationMinutes,
            teacherName: row.teacherName,
            teacherImageUrl: row.teacherImageUrl,
            statusMicrocopy: row.statusMicrocopy,
            hasAttachments: row.hasAttachments,
          }),
        ),
      });
      cursor = addDays(cursor, 1);
    }

    const sundayStart = addDays(weekStartUtc, 6);
    const weekRangeLabel = formatBatchDateRange(weekStartUtc, sundayStart);

    res.json({
      timeZone: tz,
      weekStartYmd: mondayYmd,
      weekRangeLabel,
      weekOffset: parsed.data ? null : weekOffsetParsed,
      days,
    });
  }),
);
