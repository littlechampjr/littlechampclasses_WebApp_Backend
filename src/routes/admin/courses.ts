import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { Course } from "../../models/Course.js";
import { CourseStudyOutline } from "../../models/CourseStudyOutline.js";
import { CourseTeacher } from "../../models/CourseTeacher.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { mapPurchaseFlow } from "../../services/coursePurchasePricing.js";
import { validateCourseForPublish } from "../../services/publishValidation.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminCoursesRouter = Router();

adminCoursesRouter.use(requireAdminAuth);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapOutlineSubjectDoc(sub: {
  key: string;
  label: string;
  sortOrder?: number;
  chapters?: unknown[];
}) {
  const chapters = Array.isArray(sub.chapters) ? sub.chapters : [];
  return {
    key: sub.key,
    label: sub.label,
    sortOrder: sub.sortOrder ?? 0,
    chapters: chapters.map((chRaw) => {
      const ch = chRaw as Record<string, unknown>;
      return {
      title: String(ch.title ?? ""),
      videoCount: typeof ch.videoCount === "number" ? ch.videoCount : 0,
      exerciseCount: typeof ch.exerciseCount === "number" ? ch.exerciseCount : 0,
      noteCount: typeof ch.noteCount === "number" ? ch.noteCount : 0,
      sortOrder: typeof ch.sortOrder === "number" ? ch.sortOrder : 0,
      dateRange:
        ch.dateRange && typeof ch.dateRange === "object"
          ? {
              start: (ch.dateRange as { start?: unknown }).start
                ? new Date(String((ch.dateRange as { start?: unknown }).start))
                : null,
              end: (ch.dateRange as { end?: unknown }).end
                ? new Date(String((ch.dateRange as { end?: unknown }).end))
                : null,
            }
          : undefined,
      lectures: Array.isArray(ch.lectures)
        ? ch.lectures.map((lecRaw) => {
            const lec = lecRaw as Record<string, unknown>;
            return {
            title: String(lec.title ?? ""),
            durationMinutes: typeof lec.durationMinutes === "number" ? lec.durationMinutes : 0,
            subjectLabel: typeof lec.subjectLabel === "string" ? lec.subjectLabel : "",
            videoUrl: typeof lec.videoUrl === "string" ? lec.videoUrl : "",
            thumbnailUrl: typeof lec.thumbnailUrl === "string" ? lec.thumbnailUrl : "",
            teacher:
              lec.teacher && mongoose.isValidObjectId(String(lec.teacher))
                ? new mongoose.Types.ObjectId(String(lec.teacher))
                : null,
            sortOrder: typeof lec.sortOrder === "number" ? lec.sortOrder : 0,
          };
          })
        : [],
      notes: Array.isArray(ch.notes)
        ? ch.notes.map((nRaw) => {
            const n = nRaw as Record<string, unknown>;
            return {
            title: String(n.title ?? ""),
            kind: n.kind as "class_note" | "chapter_pdf" | "dha",
            occurredAt: new Date(String(n.occurredAt ?? "")),
            fileUrl: String(n.fileUrl ?? ""),
            sortOrder: typeof n.sortOrder === "number" ? n.sortOrder : 0,
          };
          })
        : [],
      };
    }),
  };
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(["draft", "published", "all"]).optional().default("all"),
});

adminCoursesRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { page, limit, search, status } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (status !== "all") {
      filter.status = status;
    }
    if (search?.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [{ title: rx }, { slug: rx }];
    }

    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    res.json({
      total,
      page,
      limit,
      courses: rows.map((c) => ({
        id: c._id.toString(),
        title: c.title,
        slug: c.slug,
        status: c.status ?? "published",
        isActive: c.isActive,
        tags: c.tags ?? [],
        track: c.track,
        pricePaise: c.pricePaise,
        compareAtPricePaise: c.compareAtPricePaise ?? null,
        scheduleStartsAt: c.scheduleStartsAt ?? null,
        scheduleEndsAt: c.scheduleEndsAt ?? null,
        updatedAt: c.updatedAt,
      })),
    });
  }),
);

const courseCreateBody = z.object({
  title: z.string().min(1).max(400),
  slug: z.string().min(1).max(160),
  description: z.string().min(1),
  detailDescription: z.string().optional().default(""),
  track: z.enum(["after-school", "english", "maths", "activity"]),
  pricePaise: z.number().int().min(0),
  compareAtPricePaise: z.number().int().min(0).nullable().optional(),
  liveSessionsFirst: z.number().int().min(0).optional(),
  liveSessionsSecond: z.number().int().min(0).optional(),
  isDemo: z.boolean().optional(),
  bookDemoEnabled: z.boolean().optional(),
  previewVideoUrl: z.string().max(4000).optional(),
  thumbnailUrl: z.string().max(4000).optional(),
  marketingTitle: z.string().max(400).optional(),
  marketingBullets: z.array(z.string()).optional(),
  classStartsAt: z.union([z.string(), z.null()]).optional(),
  scheduleStartsAt: z.union([z.string(), z.null()]).optional(),
  scheduleEndsAt: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["draft", "published"]).optional(),
  tags: z.array(z.string().max(64)).optional(),
  isActive: z.boolean().optional(),
});

adminCoursesRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = courseCreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    try {
      const doc = await Course.create({
        ...b,
        compareAtPricePaise: b.compareAtPricePaise ?? null,
        classStartsAt: b.classStartsAt ? new Date(b.classStartsAt) : null,
        scheduleStartsAt: b.scheduleStartsAt ? new Date(b.scheduleStartsAt) : null,
        scheduleEndsAt: b.scheduleEndsAt ? new Date(b.scheduleEndsAt) : null,
      });
      await writeAdminAudit({
        actorAdminId: req.admin!.id,
        action: "course.create",
        entityType: "Course",
        entityId: doc._id.toString(),
        summary: doc.slug,
        ip: req.ip,
      });
      res.status(201).json({ id: doc._id.toString() });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000) {
        res.status(409).json({ error: "Slug already exists" });
        return;
      }
      throw e;
    }
  }),
);

const bulkBody = z.object({
  courseIds: z.array(z.string()).min(1).max(200),
  action: z.enum(["deactivate", "publish", "draft"]),
});

adminCoursesRouter.post(
  "/bulk-actions",
  requirePermission(ADMIN_PERMISSIONS.COURSES_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = bulkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const ids = parsed.data.courseIds.filter((id) => mongoose.isValidObjectId(id));
    const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
    if (oids.length === 0) {
      res.status(400).json({ error: "No valid course ids" });
      return;
    }

    if (parsed.data.action === "deactivate") {
      await Course.updateMany(
        { _id: { $in: oids } },
        { $set: { isActive: false, status: "draft" } },
      );
    } else if (parsed.data.action === "publish") {
      await Course.updateMany({ _id: { $in: oids } }, { $set: { status: "published", isActive: true } });
    } else {
      await Course.updateMany({ _id: { $in: oids } }, { $set: { status: "draft" } });
    }

    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: `course.bulk.${parsed.data.action}`,
      entityType: "Course",
      summary: `${oids.length} courses`,
      ip: req.ip,
    });

    res.json({ ok: true, affected: oids.length });
  }),
);

const courseIdParam = z.object({
  courseId: z.string().refine((id) => mongoose.isValidObjectId(id)),
});

const dateRangeZ = z
  .object({
    start: z.union([z.string(), z.null()]).optional(),
    end: z.union([z.string(), z.null()]).optional(),
  })
  .optional();

const lectureZ = z.object({
  title: z.string().min(1).max(300),
  durationMinutes: z.number().min(0).optional(),
  subjectLabel: z.string().max(120).optional(),
  videoUrl: z.string().max(4000).optional(),
  thumbnailUrl: z.string().max(4000).optional(),
  teacher: z.union([z.string(), z.null()]).optional(),
  sortOrder: z.number().optional(),
});

const noteZ = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(["class_note", "chapter_pdf", "dha"]),
  occurredAt: z.string(),
  fileUrl: z.string().min(1).max(4000),
  sortOrder: z.number().optional(),
});

const chapterZ = z.object({
  title: z.string().min(1).max(200),
  videoCount: z.number().min(0).optional(),
  exerciseCount: z.number().min(0).optional(),
  noteCount: z.number().min(0).optional(),
  sortOrder: z.number().optional(),
  dateRange: dateRangeZ,
  lectures: z.array(lectureZ).optional(),
  notes: z.array(noteZ).optional(),
});

const subjectZ = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  sortOrder: z.number().optional(),
  chapters: z.array(chapterZ),
});

const outlinePutBody = z.object({
  subjects: z.array(subjectZ),
});

const courseTeachersPutBody = z.object({
  links: z.array(
    z.object({
      teacherId: z.string().refine((id) => mongoose.isValidObjectId(id)),
      subjectLabel: z.string().min(1).max(120),
      sortOrder: z.number().optional(),
    }),
  ),
});

const couponsPutBody = z.object({
  coupons: z.array(
    z.object({
      code: z.string().min(1).max(64),
      label: z.string().min(1).max(200),
      discountPaise: z.number().min(0).nullable().optional(),
      discountPercent: z.number().min(0).max(100).nullable().optional(),
      active: z.boolean().optional(),
      expiresAt: z.union([z.string(), z.null()]).optional(),
      maxRedemptions: z.number().min(1).nullable().optional(),
      notes: z.string().max(500).optional(),
    }),
  ),
});

const byCourse = Router({ mergeParams: true });

byCourse.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const c = await Course.findById(p.data.courseId).lean();
    if (!c) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const pf = mapPurchaseFlow(c.purchaseFlow);
    res.json({
      course: {
        id: c._id.toString(),
        title: c.title,
        slug: c.slug,
        description: c.description,
        detailDescription: c.detailDescription ?? "",
        track: c.track,
        pricePaise: c.pricePaise,
        compareAtPricePaise: c.compareAtPricePaise ?? null,
        liveSessionsFirst: c.liveSessionsFirst ?? 6,
        liveSessionsSecond: c.liveSessionsSecond ?? 6,
        isDemo: c.isDemo,
        bookDemoEnabled: c.bookDemoEnabled ?? false,
        previewVideoUrl: c.previewVideoUrl ?? "",
        thumbnailUrl: c.thumbnailUrl ?? "",
        marketingTitle: c.marketingTitle ?? "",
        marketingBullets: c.marketingBullets ?? [],
        classStartsAt: c.classStartsAt ?? null,
        scheduleStartsAt: c.scheduleStartsAt ?? null,
        scheduleEndsAt: c.scheduleEndsAt ?? null,
        status: c.status ?? "published",
        tags: c.tags ?? [],
        isActive: c.isActive,
        purchaseFlowEnabled: Boolean(pf),
        purchaseFlow: c.purchaseFlow ?? undefined,
      },
    });
  }),
);

byCourse.patch(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const partial = courseCreateBody.partial().safeParse(req.body);
    if (!partial.success) {
      res.status(400).json({ error: partial.error.flatten().fieldErrors });
      return;
    }
    const b = partial.data;
    const setDoc: Record<string, unknown> = { ...b };
    if (b.classStartsAt !== undefined) {
      setDoc.classStartsAt = b.classStartsAt ? new Date(b.classStartsAt) : null;
    }
    if (b.scheduleStartsAt !== undefined) {
      setDoc.scheduleStartsAt = b.scheduleStartsAt ? new Date(b.scheduleStartsAt) : null;
    }
    if (b.scheduleEndsAt !== undefined) {
      setDoc.scheduleEndsAt = b.scheduleEndsAt ? new Date(b.scheduleEndsAt) : null;
    }
    delete setDoc.slug;
    try {
      const updated = await Course.findByIdAndUpdate(p.data.courseId, { $set: setDoc }, { new: true }).lean();
      if (!updated) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      if (b.slug) {
        await Course.updateOne({ _id: p.data.courseId }, { $set: { slug: b.slug } });
      }
      await writeAdminAudit({
        actorAdminId: req.admin!.id,
        action: "course.update",
        entityType: "Course",
        entityId: p.data.courseId,
        ip: req.ip,
      });
      res.json({ ok: true });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000) {
        res.status(409).json({ error: "Slug already exists" });
        return;
      }
      throw e;
    }
  }),
);

byCourse.delete(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    await Course.findByIdAndDelete(p.data.courseId);
    await CourseStudyOutline.deleteMany({ course: p.data.courseId });
    await CourseTeacher.deleteMany({ course: p.data.courseId });
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "course.delete",
      entityType: "Course",
      entityId: p.data.courseId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

byCourse.post(
  "/validate-publish",
  requirePermission(ADMIN_PERMISSIONS.COURSES_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const result = await validateCourseForPublish(new mongoose.Types.ObjectId(p.data.courseId));
    res.json(result);
  }),
);

byCourse.get(
  "/outline",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const outline = await CourseStudyOutline.findOne({ course: p.data.courseId }).lean();
    res.json({
      outline: outline ?? { course: p.data.courseId, subjects: [] },
      updatedAt: outline?.updatedAt ?? null,
    });
  }),
);

byCourse.put(
  "/outline",
  requirePermission(ADMIN_PERMISSIONS.OUTLINE_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const parsed = outlinePutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const courseOid = new mongoose.Types.ObjectId(p.data.courseId);
    const exists = await Course.exists({ _id: courseOid });
    if (!exists) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const subjects = parsed.data.subjects.map((s) => mapOutlineSubjectDoc(s));

    await CourseStudyOutline.findOneAndUpdate(
      { course: courseOid },
      { $set: { subjects } },
      { upsert: true, new: true },
    );

    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "outline.upsert",
      entityType: "CourseStudyOutline",
      entityId: p.data.courseId,
      ip: req.ip,
    });

    res.json({ ok: true });
  }),
);

byCourse.get(
  "/teachers",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const links = await CourseTeacher.find({ course: p.data.courseId })
      .populate("teacher")
      .sort({ sortOrder: 1 })
      .lean();
    res.json({
      links: links.map((ct) => ({
        id: ct._id.toString(),
        teacherId: String(ct.teacher),
        subjectLabel: ct.subjectLabel,
        sortOrder: ct.sortOrder ?? 0,
        teacher: ct.teacher,
      })),
    });
  }),
);

byCourse.put(
  "/teachers",
  requirePermission(ADMIN_PERMISSIONS.TEACHERS_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const parsed = courseTeachersPutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const courseOid = new mongoose.Types.ObjectId(p.data.courseId);
    await CourseTeacher.deleteMany({ course: courseOid });
    const docs = parsed.data.links.map((l, idx) => ({
      course: courseOid,
      teacher: new mongoose.Types.ObjectId(l.teacherId),
      subjectLabel: l.subjectLabel,
      sortOrder: l.sortOrder ?? idx,
    }));
    if (docs.length > 0) {
      await CourseTeacher.insertMany(docs);
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "course.teachers.replace",
      entityType: "Course",
      entityId: p.data.courseId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

byCourse.get(
  "/coupons",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const c = await Course.findById(p.data.courseId).lean();
    if (!c) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const pf = c.purchaseFlow as Record<string, unknown> | undefined;
    const coupons = Array.isArray(pf?.coupons) ? pf?.coupons : [];
    res.json({ coupons });
  }),
);

byCourse.put(
  "/coupons",
  requirePermission(ADMIN_PERMISSIONS.COUPONS_WRITE),
  asyncHandler(async (req, res) => {
    const p = courseIdParam.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const parsed = couponsPutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const normalized = parsed.data.coupons.map((c) => ({
      code: c.code.trim().toUpperCase(),
      label: c.label.trim(),
      discountPaise: c.discountPaise ?? null,
      discountPercent: c.discountPercent ?? null,
      active: c.active !== false,
      expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
      maxRedemptions: c.maxRedemptions ?? null,
      notes: c.notes?.trim() ?? "",
    }));

    const course = await Course.findById(p.data.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const pf = (course.purchaseFlow ?? {}) as Record<string, unknown>;
    pf.coupons = normalized;
    course.purchaseFlow = pf as typeof course.purchaseFlow;
    await course.save();

    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "course.coupons.replace",
      entityType: "Course",
      entityId: p.data.courseId,
      ip: req.ip,
    });

    res.json({ ok: true });
  }),
);

adminCoursesRouter.use("/:courseId", byCourse);
