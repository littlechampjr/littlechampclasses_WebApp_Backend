import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { ProgramFaq } from "../../models/ProgramFaq.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminFaqsRouter = Router();

adminFaqsRouter.use(requireAdminAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});

adminFaqsRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.FAQS_READ),
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
      filter.$or = [{ question: rx }, { answer: rx }];
    }
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      ProgramFaq.countDocuments(filter),
      ProgramFaq.find(filter).sort({ sortOrder: 1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({
      total,
      page,
      limit,
      faqs: rows.map((f) => ({
        id: f._id.toString(),
        question: f.question,
        answer: f.answer,
        sortOrder: f.sortOrder ?? 0,
        isActive: f.isActive !== false,
        courseIds: (f.courseIds ?? []).map(String),
      })),
    });
  }),
);

const faqBody = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(12000),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  courseIds: z.array(z.string()).optional(),
});

adminFaqsRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.FAQS_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = faqBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const courseIds = (b.courseIds ?? []).filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    const doc = await ProgramFaq.create({
      question: b.question,
      answer: b.answer,
      sortOrder: b.sortOrder ?? 0,
      isActive: b.isActive !== false,
      courseIds,
    });
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "faq.create",
      entityType: "ProgramFaq",
      entityId: doc._id.toString(),
      ip: req.ip,
    });
    res.status(201).json({ id: doc._id.toString() });
  }),
);

adminFaqsRouter.patch(
  "/:faqId",
  requirePermission(ADMIN_PERMISSIONS.FAQS_WRITE),
  asyncHandler(async (req, res) => {
    const { faqId } = req.params;
    if (!mongoose.isValidObjectId(faqId)) {
      res.status(400).json({ error: "Invalid faq id" });
      return;
    }
    const parsed = faqBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const set: Record<string, unknown> = { ...b };
    if (b.courseIds) {
      set.courseIds = b.courseIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    }
    const updated = await ProgramFaq.findByIdAndUpdate(faqId, { $set: set }, { new: true }).lean();
    if (!updated) {
      res.status(404).json({ error: "FAQ not found" });
      return;
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "faq.update",
      entityType: "ProgramFaq",
      entityId: faqId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

adminFaqsRouter.delete(
  "/:faqId",
  requirePermission(ADMIN_PERMISSIONS.FAQS_WRITE),
  asyncHandler(async (req, res) => {
    const { faqId } = req.params;
    if (!mongoose.isValidObjectId(faqId)) {
      res.status(400).json({ error: "Invalid faq id" });
      return;
    }
    await ProgramFaq.findByIdAndDelete(faqId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "faq.delete",
      entityType: "ProgramFaq",
      entityId: faqId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
