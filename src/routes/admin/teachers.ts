import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { Teacher } from "../../models/Teacher.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminTeachersRouter = Router();

adminTeachersRouter.use(requireAdminAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});

adminTeachersRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { page, limit, search } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.name = rx;
    }
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      Teacher.countDocuments(filter),
      Teacher.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({
      total,
      page,
      limit,
      teachers: rows.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        imageUrl: t.imageUrl ?? "",
        bioLine: t.bioLine ?? "",
        subjectExpertise: t.subjectExpertise ?? [],
        isActive: t.isActive !== false,
      })),
    });
  }),
);

const teacherBody = z.object({
  name: z.string().min(1).max(200),
  imageUrl: z.string().max(4000).optional(),
  bioLine: z.string().max(280).optional(),
  subjectExpertise: z.array(z.string().max(120)).optional(),
  isActive: z.boolean().optional(),
});

adminTeachersRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.TEACHERS_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = teacherBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const doc = await Teacher.create(parsed.data);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "teacher.create",
      entityType: "Teacher",
      entityId: doc._id.toString(),
      ip: req.ip,
    });
    res.status(201).json({ id: doc._id.toString() });
  }),
);

adminTeachersRouter.patch(
  "/:teacherId",
  requirePermission(ADMIN_PERMISSIONS.TEACHERS_WRITE),
  asyncHandler(async (req, res) => {
    const { teacherId } = req.params;
    if (!mongoose.isValidObjectId(teacherId)) {
      res.status(400).json({ error: "Invalid teacher id" });
      return;
    }
    const parsed = teacherBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const updated = await Teacher.findByIdAndUpdate(teacherId, { $set: parsed.data }, { new: true }).lean();
    if (!updated) {
      res.status(404).json({ error: "Teacher not found" });
      return;
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "teacher.update",
      entityType: "Teacher",
      entityId: teacherId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

adminTeachersRouter.delete(
  "/:teacherId",
  requirePermission(ADMIN_PERMISSIONS.TEACHERS_WRITE),
  asyncHandler(async (req, res) => {
    const { teacherId } = req.params;
    if (!mongoose.isValidObjectId(teacherId)) {
      res.status(400).json({ error: "Invalid teacher id" });
      return;
    }
    await Teacher.findByIdAndDelete(teacherId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "teacher.delete",
      entityType: "Teacher",
      entityId: teacherId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
