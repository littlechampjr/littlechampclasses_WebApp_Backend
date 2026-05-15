import { addDays } from "date-fns";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { CourseAssignment } from "../models/CourseAssignment.js";
import { ClassSession } from "../models/ClassSession.js";
import { Course } from "../models/Course.js";
import { CourseStudyOutline } from "../models/CourseStudyOutline.js";
import { CourseTeacher } from "../models/CourseTeacher.js";
import { Enrollment } from "../models/Enrollment.js";
import { ProgramFaq } from "../models/ProgramFaq.js";
import { Teacher } from "../models/Teacher.js";
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
import { loadBatchesGrouped, mapBatchesForCourse, mapCourse } from "./courses.js";
import {
  programTitleFromCourse,
  type CourseLean as SharedCourseLean,
} from "./coursesShared.js";

export const learnerMeRouter = Router();

type CourseLeanMini = {
  _id: mongoose.Types.ObjectId;
  title: string;
  marketingTitle?: string;
};

type BatchLean = {
  _id: mongoose.Types.ObjectId;
  code: string;
  startsAt: Date;
  endsAt: Date;
  course?: CourseLeanMini;
};

type EnrollmentLean = {
  _id: mongoose.Types.ObjectId;
  purchasedAt: Date;
  batch: BatchLean;
};

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
  meetUrl?: string;
}) {
  const tz = env.scheduleTz;
  const ymdToday = todayYmd(tz);
  const ymdSession = ymdInTz(s.startsAt, tz);
  const ymdTomorrow = ymdInTz(addDays(zonedDayStartUtc(ymdToday, tz), 1), tz);
  const isTomorrow = ymdSession === ymdTomorrow;
  const meetUrl = typeof s.meetUrl === "string" ? s.meetUrl.trim() : "";
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
    meetUrl,
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

type StudyOutlineChapterLean = {
  _id?: mongoose.Types.ObjectId;
  title: string;
  videoCount?: number;
  exerciseCount?: number;
  noteCount?: number;
  sortOrder?: number;
  lectures?: Array<{
    _id?: mongoose.Types.ObjectId;
    title: string;
    durationMinutes?: number;
    subjectLabel?: string;
    videoUrl: string;
    thumbnailUrl?: string;
    teacher?: mongoose.Types.ObjectId | null;
    sortOrder?: number;
  }>;
  notes?: Array<{
    _id?: mongoose.Types.ObjectId;
    title: string;
    kind: string;
    occurredAt: Date;
    fileUrl: string;
    sortOrder?: number;
  }>;
  classNotes?: Array<{
    _id: mongoose.Types.ObjectId;
    title: string;
    publishedAt?: Date | null;
    pdfUrl: string;
    viewerMode?: string;
    sortOrder?: number;
  }>;
  chapterPdfs?: StudyOutlineChapterLean["classNotes"];
  dhaSolutions?: StudyOutlineChapterLean["classNotes"];
};

type StudyOutlineSubjectLean = {
  key: string;
  label: string;
  sortOrder?: number;
  chapters?: StudyOutlineChapterLean[];
};

function sortOutlineChapters<T extends { sortOrder?: number }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Legacy chapters may omit subdoc _id; URL uses "{subjectKey}~{index}" (index = sorted chapter order). */
function parseChapterSlotId(chapterId: string): { subjectKey: string; index: number } | null {
  const lastTilde = chapterId.lastIndexOf("~");
  if (lastTilde <= 0) return null;
  const subjectKey = chapterId.slice(0, lastTilde);
  const idxStr = chapterId.slice(lastTilde + 1);
  const index = parseInt(idxStr, 10);
  if (!Number.isInteger(index) || index < 0 || !subjectKey.length) return null;
  return { subjectKey, index };
}

function findChapterContext(
  outline: { subjects?: StudyOutlineSubjectLean[] } | null | undefined,
  chapterId: string,
):
  | { subjectKey: string; subjectLabel: string; chapter: StudyOutlineChapterLean }
  | null {
  if (!outline?.subjects?.length) return null;
  for (const sub of outline.subjects) {
    for (const ch of sub.chapters ?? []) {
      if (ch._id?.toString() === chapterId) {
        return { subjectKey: sub.key, subjectLabel: sub.label, chapter: ch };
      }
    }
  }
  const slot = parseChapterSlotId(chapterId);
  if (slot) {
    const sub = outline.subjects.find((s) => s.key === slot.subjectKey);
    if (sub) {
      const sorted = sortOutlineChapters(sub.chapters ?? []);
      const ch = sorted[slot.index];
      if (ch) return { subjectKey: sub.key, subjectLabel: sub.label, chapter: ch };
    }
  }
  return null;
}

function sortByResourceOrder<T extends { sortOrder?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function mapOutlinePdfRow(
  p: NonNullable<StudyOutlineChapterLean["classNotes"]>[number],
  timeZone: string,
  fallbackId: string,
) {
  const d = p.publishedAt ? new Date(p.publishedAt) : null;
  return {
    id: p._id?.toString() || fallbackId,
    title: p.title,
    publishedAt: d ? d.toISOString() : null,
    publishedAtLabel: d ? dayMonthLabelInTz(d, timeZone) : "",
    pdfUrl: p.pdfUrl,
    viewerMode: p.viewerMode === "newTab" ? ("newTab" as const) : ("inline" as const),
    sortOrder: p.sortOrder ?? 0,
  };
}

learnerMeRouter.get(
  "/enrollments/:enrollmentId/chapters/:chapterId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { enrollmentId, chapterId } = req.params;
    if (!mongoose.isValidObjectId(enrollmentId)) {
      res.status(400).json({ error: "Invalid enrollment id" });
      return;
    }
    const trimmedChapterId = String(chapterId ?? "").trim();
    if (!trimmedChapterId || trimmedChapterId.length > 240) {
      res.status(400).json({ error: "Invalid chapter id" });
      return;
    }

    const row = await Enrollment.findOne({
      _id: enrollmentId,
      user: req.userId,
      status: "active",
    })
      .populate({
        path: "batch",
        populate: { path: "course" },
      })
      .lean();

    if (!row || !row.batch || typeof row.batch !== "object") {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const batch = row.batch as unknown as {
      _id: mongoose.Types.ObjectId;
      code: string;
      startsAt: Date;
      endsAt: Date;
      course?: CourseLeanMini & { _id?: mongoose.Types.ObjectId };
    };

    if (!batch.code || !batch._id) {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const courseMini = batch.course;
    if (!courseMini?._id) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const courseOid = courseMini._id;
    const c = await Course.findById(courseOid).lean();
    if (!c?.isActive) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const cl = c as unknown as SharedCourseLean;
    const programTitle = programTitleFromCourse(cl);

    const outline = await CourseStudyOutline.findOne({ course: courseOid }).lean();
    const ctx = findChapterContext(
      outline as { subjects?: StudyOutlineSubjectLean[] } | null,
      trimmedChapterId,
    );
    if (!ctx) {
      res.status(404).json({ error: "Chapter not found" });
      return;
    }

    const ch = ctx.chapter;
    const lecturesSorted = sortByResourceOrder(ch.lectures ?? []);
    const teacherIds = [
      ...new Set(
        lecturesSorted
          .map((l) => l.teacher)
          .filter((id): id is mongoose.Types.ObjectId => Boolean(id)),
      ),
    ];
    const teacherDocs =
      teacherIds.length > 0
        ? await Teacher.find({ _id: { $in: teacherIds } })
            .select({ name: 1, imageUrl: 1 })
            .lean()
        : [];
    const teacherById = new Map(
      teacherDocs.map((t) => [
        t._id.toString(),
        {
          name: String(t.name ?? "").trim() || "Mentor",
          imageUrl: String(t.imageUrl ?? "").trim(),
        },
      ]),
    );

    const lectures = lecturesSorted.map((l, i) => {
      const tid = l.teacher?.toString();
      const tMeta = tid ? teacherById.get(tid) : undefined;
      const legacySec = (l as { durationSec?: number }).durationSec;
      const durationSec =
        legacySec != null && Number.isFinite(legacySec)
          ? Math.round(legacySec)
          : Math.round(Number(l.durationMinutes ?? 0) * 60);
      return {
        id: l._id?.toString() || `lec-${i}`,
        title: l.title,
        durationSec,
        videoUrl: l.videoUrl,
        subjectTag: ctx.subjectLabel,
        teacherName: tMeta?.name ?? "",
        teacherImageUrl: tMeta?.imageUrl ?? "",
      };
    });

    const tz = env.scheduleTz;

    const startsAt = new Date(batch.startsAt);
    const endsAt = new Date(batch.endsAt);

    res.json({
      chapterMeta: {
        chapterId: trimmedChapterId,
        chapterTitle: ch.title,
        subjectKey: ctx.subjectKey,
        subjectLabel: ctx.subjectLabel,
        batchDateRangeLabel: formatBatchDateRange(startsAt, endsAt),
        programTitle,
      },
      lectures,
      classNotes: sortByResourceOrder(ch.classNotes ?? []).map((p, i) =>
        mapOutlinePdfRow(p, tz, `class-note-${i}`),
      ),
      chapterPdfs: sortByResourceOrder(ch.chapterPdfs ?? []).map((p, i) =>
        mapOutlinePdfRow(p, tz, `chapter-pdf-${i}`),
      ),
      dhaSolutions: sortByResourceOrder(ch.dhaSolutions ?? []).map((p, i) =>
        mapOutlinePdfRow(p, tz, `dha-${i}`),
      ),
    });
  }),
);

learnerMeRouter.get(
  "/enrollments/:enrollmentId/program",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { enrollmentId } = req.params;
    if (!mongoose.isValidObjectId(enrollmentId)) {
      res.status(400).json({ error: "Invalid enrollment id" });
      return;
    }

    const row = await Enrollment.findOne({
      _id: enrollmentId,
      user: req.userId,
      status: "active",
    })
      .populate({
        path: "batch",
        populate: { path: "course" },
      })
      .lean();

    if (!row || !row.batch || typeof row.batch !== "object") {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const batch = row.batch as unknown as {
      _id: mongoose.Types.ObjectId;
      code: string;
      startsAt: Date;
      endsAt: Date;
      course?: CourseLeanMini & { _id?: mongoose.Types.ObjectId };
    };

    if (!batch.code || !batch._id) {
      res.status(404).json({ error: "Enrollment not found" });
      return;
    }

    const courseMini = batch.course;
    if (!courseMini?._id) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const courseOid = courseMini._id;
    const c = await Course.findById(courseOid).lean();
    if (!c?.isActive) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const cl = c as unknown as SharedCourseLean;
    const batchMap = await loadBatchesGrouped([courseOid]);
    const programTitle = programTitleFromCourse(cl);
    const rawBatches = batchMap.get(courseOid.toString()) ?? [];
    const batchesDto = mapBatchesForCourse(programTitle, rawBatches);
    const courseDto = mapCourse(cl, batchesDto);

    const [teacherLinks, faqs, outline, homeworkRows] = await Promise.all([
      CourseTeacher.find({ course: courseOid }).populate("teacher").sort({ sortOrder: 1 }).lean(),
      ProgramFaq.find({ courseIds: courseOid, isActive: true }).sort({ sortOrder: 1 }).lean(),
      CourseStudyOutline.findOne({ course: courseOid }).lean(),
      CourseAssignment.find({
        course: courseOid,
        isActive: true,
        $or: [{ batch: null }, { batch: batch._id }],
      })
        .sort({ dueAt: 1 })
        .lean(),
    ]);

    const teachers = teacherLinks
      .map((a) => {
        const t = a.teacher as
          | { _id: mongoose.Types.ObjectId; name?: string; imageUrl?: string; bioLine?: string }
          | null
          | undefined;
        if (!t?._id) return null;
        return {
          id: t._id.toString(),
          name: String(t.name ?? "").trim() || "Mentor",
          imageUrl: String(t.imageUrl ?? "").trim(),
          subjectLabel: String(a.subjectLabel ?? "").trim() || "Subject",
          bioLine: String(t.bioLine ?? "").trim(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const faqDtos = faqs.map((f) => ({
      id: f._id.toString(),
      question: f.question,
      answer: f.answer,
    }));

    const studySubjects =
      outline?.subjects?.map((s) => ({
        key: s.key,
        label: s.label,
        sortOrder: s.sortOrder ?? 0,
        chapters: sortOutlineChapters([...(s.chapters ?? [])]).map((ch, idx) => {
          const raw = ch as unknown as Record<string, unknown>;
          const lecturesRaw = Array.isArray(raw.lectures) ? raw.lectures : [];
          const notesRaw = Array.isArray(raw.notes) ? raw.notes : [];
          const dateRange = raw.dateRange as { start?: unknown; end?: unknown } | undefined;
          const lectureCount = lecturesRaw.length;
          const noteCountFromNotes = notesRaw.length;
          return {
          id: ch._id?.toString() || `${s.key}~${idx}`,
            title: ch.title,
            videoCount: lectureCount > 0 ? lectureCount : (ch.videoCount ?? 0),
            exerciseCount: ch.exerciseCount ?? 0,
            noteCount: noteCountFromNotes > 0 ? noteCountFromNotes : (ch.noteCount ?? 0),
            sortOrder: ch.sortOrder ?? 0,
            dateRange:
              dateRange?.start != null || dateRange?.end != null
                ? {
                    start:
                      dateRange.start != null ? new Date(String(dateRange.start)).toISOString() : null,
                    end: dateRange.end != null ? new Date(String(dateRange.end)).toISOString() : null,
                  }
                : null,
            lectures: lecturesRaw.map((lec: Record<string, unknown>) => ({
              title: String(lec.title ?? ""),
              durationMinutes: Number(lec.durationMinutes ?? 0),
              subjectLabel: String(lec.subjectLabel ?? ""),
              videoUrl: String(lec.videoUrl ?? ""),
              thumbnailUrl: String(lec.thumbnailUrl ?? ""),
              teacherId: lec.teacher ? String(lec.teacher) : null,
              sortOrder: Number(lec.sortOrder ?? 0),
            })),
            notes: notesRaw.map((n: Record<string, unknown>) => ({
              title: String(n.title ?? ""),
              kind: String(n.kind ?? ""),
              occurredAt:
                n.occurredAt != null ? new Date(String(n.occurredAt)).toISOString() : new Date(0).toISOString(),
              fileUrl: String(n.fileUrl ?? ""),
              sortOrder: Number(n.sortOrder ?? 0),
            })),
          };
        }),
      })) ?? [];

    const homework = homeworkRows.map((h) => ({
      id: h._id.toString(),
      title: h.title,
      description: h.description ?? "",
      dueAt: h.dueAt.toISOString(),
      attachmentUrl: h.attachmentUrl ?? "",
    }));

    const startsAt = new Date(batch.startsAt);
    const endsAt = new Date(batch.endsAt);

    res.json({
      isEnrolled: true,
      enrollment: {
        enrollmentId: row._id.toString(),
        batchId: batch._id.toString(),
        courseId: courseOid.toString(),
        batchCode: batch.code,
        purchasedAt: new Date(row.purchasedAt).toISOString(),
        batchDateRangeLabel: formatBatchDateRange(startsAt, endsAt),
      },
      course: courseDto,
      teachers,
      faqs: faqDtos,
      studyRoom: { subjects: studySubjects },
      homework,
    });
  }),
);

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
          meetUrl: s.meetUrl,
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
          meetUrl: s.meetUrl,
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
        courseTitle: programTitleFromCourse(c as Pick<SharedCourseLean, "title" | "marketingTitle">),
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
            meetUrl: row.meetUrl,
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
