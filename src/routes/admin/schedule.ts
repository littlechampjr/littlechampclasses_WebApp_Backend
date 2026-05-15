import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { ClassSession } from "../../models/ClassSession.js";
import { CourseBatch } from "../../models/CourseBatch.js";
import { Teacher } from "../../models/Teacher.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminScheduleRouter = Router({ mergeParams: true });

adminScheduleRouter.use(requireAdminAuth);

async function applyTeacherDenorm(body: {
  teacher?: mongoose.Types.ObjectId | null;
  teacherName?: string;
  teacherImageUrl?: string;
}): Promise<void> {
  if (!body.teacher) return;
  const t = await Teacher.findById(body.teacher).lean();
  if (t) {
    body.teacherName = t.name;
    body.teacherImageUrl = t.imageUrl ?? "";
  }
}

const batchCreate = z.object({
  code: z.string().min(1).max(32),
  startsAt: z.string(),
  endsAt: z.string(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

adminScheduleRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const courseId = req.params.courseId as string;
    if (!mongoose.isValidObjectId(courseId)) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const rows = await CourseBatch.find({ course: courseId }).sort({ sortOrder: 1, startsAt: 1 }).lean();
    res.json({
      batches: rows.map((b) => ({
        id: b._id.toString(),
        code: b.code,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        isActive: b.isActive,
        sortOrder: b.sortOrder ?? 0,
      })),
    });
  }),
);

adminScheduleRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const courseId = req.params.courseId as string;
    if (!mongoose.isValidObjectId(courseId)) {
      res.status(400).json({ error: "Invalid course id" });
      return;
    }
    const parsed = batchCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { code, startsAt, endsAt, isActive, sortOrder } = parsed.data;
    try {
      const doc = await CourseBatch.create({
        course: new mongoose.Types.ObjectId(courseId),
        code: code.toUpperCase(),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        isActive: isActive !== false,
        sortOrder: sortOrder ?? 0,
      });
      await writeAdminAudit({
        actorAdminId: req.admin!.id,
        action: "batch.create",
        entityType: "CourseBatch",
        entityId: doc._id.toString(),
        ip: req.ip,
      });
      res.status(201).json({ id: doc._id.toString() });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000) {
        res.status(409).json({ error: "Batch code already exists for this course" });
        return;
      }
      throw e;
    }
  }),
);

const batchPatch = batchCreate.partial();

export const adminBatchRootRouter = Router();
adminBatchRootRouter.use(requireAdminAuth);

adminBatchRootRouter.patch(
  "/batches/:batchId",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    if (!mongoose.isValidObjectId(batchId)) {
      res.status(400).json({ error: "Invalid batch id" });
      return;
    }
    const parsed = batchPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const set: Record<string, unknown> = { ...b };
    if (b.startsAt) set.startsAt = new Date(b.startsAt);
    if (b.endsAt) set.endsAt = new Date(b.endsAt);
    if (b.code) set.code = b.code.toUpperCase();
    const updated = await CourseBatch.findByIdAndUpdate(batchId, { $set: set }, { new: true }).lean();
    if (!updated) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "batch.update",
      entityType: "CourseBatch",
      entityId: batchId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

adminBatchRootRouter.delete(
  "/batches/:batchId",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    if (!mongoose.isValidObjectId(batchId)) {
      res.status(400).json({ error: "Invalid batch id" });
      return;
    }
    await ClassSession.deleteMany({ batch: batchId });
    await CourseBatch.findByIdAndDelete(batchId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "batch.delete",
      entityType: "CourseBatch",
      entityId: batchId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

const sessionCreate = z.object({
  startsAt: z.string(),
  durationMinutes: z.number().int().min(1).max(600),
  subject: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  teacher: z.union([z.string(), z.null()]).optional(),
  teacherName: z.string().max(200).optional(),
  teacherImageUrl: z.string().max(4000).optional(),
  meetUrl: z.string().max(4000).optional(),
  statusMicrocopy: z.string().max(280).optional(),
  hasAttachments: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const adminSessionsRouter = Router({ mergeParams: true });
adminSessionsRouter.use(requireAdminAuth);

adminSessionsRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const batchId = req.params.batchId as string;
    if (!mongoose.isValidObjectId(batchId)) {
      res.status(400).json({ error: "Invalid batch id" });
      return;
    }
    const rows = await ClassSession.find({ batch: batchId }).sort({ startsAt: 1, sortOrder: 1 }).lean();
    res.json({
      sessions: rows.map((s) => ({
        id: s._id.toString(),
        startsAt: s.startsAt,
        durationMinutes: s.durationMinutes,
        subject: s.subject,
        title: s.title,
        teacher: s.teacher ? String(s.teacher) : null,
        teacherName: s.teacherName ?? "",
        teacherImageUrl: s.teacherImageUrl ?? "",
        meetUrl: s.meetUrl ?? "",
        statusMicrocopy: s.statusMicrocopy ?? "",
        hasAttachments: Boolean(s.hasAttachments),
        sortOrder: s.sortOrder ?? 0,
      })),
    });
  }),
);

adminSessionsRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const batchId = req.params.batchId as string;
    if (!mongoose.isValidObjectId(batchId)) {
      res.status(400).json({ error: "Invalid batch id" });
      return;
    }
    const parsed = sessionCreate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const batch = await CourseBatch.exists({ _id: batchId });
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }

    const teacherOid =
      parsed.data.teacher && mongoose.isValidObjectId(parsed.data.teacher)
        ? new mongoose.Types.ObjectId(parsed.data.teacher)
        : null;

    const doc = await ClassSession.create({
      batch: new mongoose.Types.ObjectId(batchId),
      startsAt: new Date(parsed.data.startsAt),
      durationMinutes: parsed.data.durationMinutes,
      subject: parsed.data.subject,
      title: parsed.data.title,
      teacher: teacherOid,
      teacherName: parsed.data.teacherName ?? "",
      teacherImageUrl: parsed.data.teacherImageUrl ?? "",
      meetUrl: parsed.data.meetUrl ?? "",
      statusMicrocopy: parsed.data.statusMicrocopy ?? "",
      hasAttachments: parsed.data.hasAttachments ?? false,
      sortOrder: parsed.data.sortOrder ?? 0,
    });

    if (teacherOid) {
      await applyTeacherDenorm(doc);
      await doc.save();
    }

    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "session.create",
      entityType: "ClassSession",
      entityId: doc._id.toString(),
      ip: req.ip,
    });

    res.status(201).json({ id: doc._id.toString() });
  }),
);

const sessionPatch = sessionCreate.partial();

adminBatchRootRouter.patch(
  "/sessions/:sessionId",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const parsed = sessionPatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const s = await ClassSession.findById(sessionId);
    if (!s) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const b = parsed.data;
    if (b.startsAt) s.startsAt = new Date(b.startsAt);
    if (b.durationMinutes != null) s.durationMinutes = b.durationMinutes;
    if (b.subject) s.subject = b.subject;
    if (b.title) s.title = b.title;
    if (b.meetUrl !== undefined) s.meetUrl = b.meetUrl ?? "";
    if (b.statusMicrocopy !== undefined) s.statusMicrocopy = b.statusMicrocopy ?? "";
    if (b.hasAttachments !== undefined) s.hasAttachments = b.hasAttachments;
    if (b.sortOrder !== undefined) s.sortOrder = b.sortOrder;
    if (b.teacherName !== undefined) s.teacherName = b.teacherName ?? "";
    if (b.teacherImageUrl !== undefined) s.teacherImageUrl = b.teacherImageUrl ?? "";
    if (b.teacher !== undefined) {
      s.teacher =
        b.teacher && mongoose.isValidObjectId(b.teacher) ? new mongoose.Types.ObjectId(b.teacher) : null;
    }
    if (s.teacher) {
      await applyTeacherDenorm(s);
    }
    await s.save();

    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "session.update",
      entityType: "ClassSession",
      entityId: sessionId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

adminBatchRootRouter.delete(
  "/sessions/:sessionId",
  requirePermission(ADMIN_PERMISSIONS.SCHEDULE_WRITE),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    if (!mongoose.isValidObjectId(sessionId)) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    await ClassSession.findByIdAndDelete(sessionId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "session.delete",
      entityType: "ClassSession",
      entityId: sessionId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
