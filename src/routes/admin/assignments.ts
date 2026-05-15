import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { CourseAssignment } from "../../models/CourseAssignment.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminAssignmentsRouter = Router();

adminAssignmentsRouter.use(requireAdminAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  courseId: z.string().optional(),
});

adminAssignmentsRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { page, limit, courseId } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (courseId && mongoose.isValidObjectId(courseId)) {
      filter.course = courseId;
    }
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      CourseAssignment.countDocuments(filter),
      CourseAssignment.find(filter).sort({ dueAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({
      total,
      page,
      limit,
      assignments: rows.map((a) => ({
        id: a._id.toString(),
        courseId: String(a.course),
        batchId: a.batch ? String(a.batch) : null,
        title: a.title,
        description: a.description ?? "",
        dueAt: a.dueAt,
        attachmentUrl: a.attachmentUrl ?? "",
        isActive: a.isActive !== false,
        sortOrder: a.sortOrder ?? 0,
      })),
    });
  }),
);

const body = z.object({
  courseId: z.string().refine((id) => mongoose.isValidObjectId(id)),
  batchId: z.union([z.string(), z.null()]).optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(12000).optional(),
  dueAt: z.string(),
  attachmentUrl: z.string().max(4000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

adminAssignmentsRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.ASSIGNMENTS_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    let batchOid: mongoose.Types.ObjectId | null = null;
    if (b.batchId && mongoose.isValidObjectId(b.batchId)) {
      batchOid = new mongoose.Types.ObjectId(b.batchId);
    }
    const doc = await CourseAssignment.create({
      course: new mongoose.Types.ObjectId(b.courseId),
      batch: batchOid,
      title: b.title,
      description: b.description ?? "",
      dueAt: new Date(b.dueAt),
      attachmentUrl: b.attachmentUrl ?? "",
      isActive: b.isActive !== false,
      sortOrder: b.sortOrder ?? 0,
    });
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "assignment.create",
      entityType: "CourseAssignment",
      entityId: doc._id.toString(),
      ip: req.ip,
    });
    res.status(201).json({ id: doc._id.toString() });
  }),
);

const assignmentPatchBody = z.object({
  batchId: z.union([z.string(), z.null()]).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(12000).optional(),
  dueAt: z.string().optional(),
  attachmentUrl: z.string().max(4000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

adminAssignmentsRouter.patch(
  "/:assignmentId",
  requirePermission(ADMIN_PERMISSIONS.ASSIGNMENTS_WRITE),
  asyncHandler(async (req, res) => {
    const { assignmentId } = req.params;
    if (!mongoose.isValidObjectId(assignmentId)) {
      res.status(400).json({ error: "Invalid assignment id" });
      return;
    }
    const parsed = assignmentPatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const set: Record<string, unknown> = {};
    if (b.title !== undefined) set.title = b.title;
    if (b.description !== undefined) set.description = b.description;
    if (b.dueAt !== undefined) set.dueAt = new Date(b.dueAt);
    if (b.attachmentUrl !== undefined) set.attachmentUrl = b.attachmentUrl;
    if (b.isActive !== undefined) set.isActive = b.isActive;
    if (b.sortOrder !== undefined) set.sortOrder = b.sortOrder;
    if (b.batchId !== undefined) {
      set.batch =
        b.batchId && mongoose.isValidObjectId(b.batchId)
          ? new mongoose.Types.ObjectId(b.batchId)
          : null;
    }
    const updated = await CourseAssignment.findByIdAndUpdate(assignmentId, { $set: set }, { new: true }).lean();
    if (!updated) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "assignment.update",
      entityType: "CourseAssignment",
      entityId: assignmentId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

adminAssignmentsRouter.delete(
  "/:assignmentId",
  requirePermission(ADMIN_PERMISSIONS.ASSIGNMENTS_WRITE),
  asyncHandler(async (req, res) => {
    const { assignmentId } = req.params;
    if (!mongoose.isValidObjectId(assignmentId)) {
      res.status(400).json({ error: "Invalid assignment id" });
      return;
    }
    await CourseAssignment.findByIdAndDelete(assignmentId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "assignment.delete",
      entityType: "CourseAssignment",
      entityId: assignmentId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
