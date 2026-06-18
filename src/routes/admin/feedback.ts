import ExcelJS from "exceljs";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { Feedback, FEEDBACK_STATUS } from "../../models/Feedback.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminFeedbackRouter = Router();

adminFeedbackRouter.use(requireAdminAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(FEEDBACK_STATUS).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

type FeedbackFilter = {
  status?: string;
  rating?: number;
  createdAt?: { $gte?: Date; $lte?: Date };
  $or?: Array<Record<string, unknown>>;
};

function buildFilter(q: z.infer<typeof listQuery>): FeedbackFilter {
  const filter: FeedbackFilter = {};
  if (q.status) filter.status = q.status;
  if (q.rating) filter.rating = q.rating;
  if (q.from || q.to) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (q.from) {
      const d = new Date(q.from);
      if (!isNaN(d.getTime())) range.$gte = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (!isNaN(d.getTime())) range.$lte = d;
    }
    if (range.$gte || range.$lte) filter.createdAt = range;
  }
  if (q.search?.trim()) {
    const rx = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { mobileNumber: rx }, { email: rx }];
  }
  return filter;
}

function snippet(input: string, max = 120): string {
  const t = input?.trim() ?? "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function firstNonEmpty(...vals: string[]): string {
  for (const v of vals) {
    if (v?.trim()) return v.trim();
  }
  return "";
}

adminFeedbackRouter.get(
  "/stats",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_READ),
  asyncHandler(async (_req, res) => {
    const [total, unread, latest] = await Promise.all([
      Feedback.countDocuments({}),
      Feedback.countDocuments({ status: "new" }),
      Feedback.findOne({}).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({
      total,
      unread,
      latest: latest
        ? {
            id: latest._id.toString(),
            name: latest.name,
            rating: latest.rating,
            createdAt:
              latest.createdAt instanceof Date
                ? latest.createdAt.toISOString()
                : String(latest.createdAt ?? ""),
            preview: snippet(
              firstNonEmpty(
                latest.additionalFeedback ?? "",
                latest.featureSuggestions ?? "",
                latest.improvementSuggestions ?? "",
                latest.activitiesSuggestions ?? "",
                latest.academicYearProgramSuggestions ?? "",
              ),
            ),
          }
        : null,
    });
  }),
);

adminFeedbackRouter.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_READ),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { page, limit } = parsed.data;
    const filter = buildFilter(parsed.data);
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      Feedback.countDocuments(filter),
      Feedback.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({
      total,
      page,
      limit,
      feedbacks: rows.map((f) => ({
        id: f._id.toString(),
        userId: f.user ? String(f.user) : null,
        name: f.name,
        mobileNumber: f.mobileNumber,
        email: f.email ?? "",
        rating: f.rating,
        status: f.status,
        createdAt:
          f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt ?? ""),
      })),
    });
  }),
);

adminFeedbackRouter.get(
  "/export",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_READ),
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const filter = buildFilter(parsed.data);
    const rows = await Feedback.find(filter).sort({ createdAt: -1 }).limit(10000).lean();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Feedback");
    ws.columns = [
      { header: "ID", key: "id", width: 26 },
      { header: "Submitted", key: "createdAt", width: 22 },
      { header: "Name", key: "name", width: 20 },
      { header: "Mobile", key: "mobileNumber", width: 14 },
      { header: "Email", key: "email", width: 26 },
      { header: "User ID", key: "userId", width: 26 },
      { header: "Rating", key: "rating", width: 8 },
      { header: "Status", key: "status", width: 10 },
      { header: "Features", key: "featureSuggestions", width: 40 },
      { header: "Improvements", key: "improvementSuggestions", width: 40 },
      { header: "Activities", key: "activitiesSuggestions", width: 40 },
      { header: "Academic Year Program", key: "academicYearProgramSuggestions", width: 40 },
      { header: "Additional", key: "additionalFeedback", width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };

    for (const f of rows) {
      ws.addRow({
        id: f._id.toString(),
        createdAt:
          f.createdAt instanceof Date
            ? f.createdAt.toISOString()
            : String(f.createdAt ?? ""),
        name: f.name,
        mobileNumber: f.mobileNumber,
        email: f.email ?? "",
        userId: f.user ? String(f.user) : "",
        rating: f.rating,
        status: f.status,
        featureSuggestions: f.featureSuggestions ?? "",
        improvementSuggestions: f.improvementSuggestions ?? "",
        activitiesSuggestions: f.activitiesSuggestions ?? "",
        academicYearProgramSuggestions: f.academicYearProgramSuggestions ?? "",
        additionalFeedback: f.additionalFeedback ?? "",
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `feedback-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  }),
);

adminFeedbackRouter.get(
  "/:id",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_READ),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const f = await Feedback.findById(id).lean();
    if (!f) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }
    res.json({
      feedback: {
        id: f._id.toString(),
        userId: f.user ? String(f.user) : null,
        name: f.name,
        mobileNumber: f.mobileNumber,
        email: f.email ?? "",
        rating: f.rating,
        status: f.status,
        featureSuggestions: f.featureSuggestions ?? "",
        improvementSuggestions: f.improvementSuggestions ?? "",
        activitiesSuggestions: f.activitiesSuggestions ?? "",
        academicYearProgramSuggestions: f.academicYearProgramSuggestions ?? "",
        additionalFeedback: f.additionalFeedback ?? "",
        ipAddress: f.ipAddress ?? "",
        userAgent: f.userAgent ?? "",
        createdAt:
          f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt ?? ""),
        updatedAt:
          f.updatedAt instanceof Date ? f.updatedAt.toISOString() : String(f.updatedAt ?? ""),
      },
    });
  }),
);

const patchSchema = z.object({
  status: z.enum(FEEDBACK_STATUS).optional(),
});

adminFeedbackRouter.patch(
  "/:id",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_WRITE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const updated = await Feedback.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true },
    ).lean();
    if (!updated) {
      res.status(404).json({ error: "Feedback not found" });
      return;
    }
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "feedback.update",
      entityType: "Feedback",
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  status: z.enum(FEEDBACK_STATUS),
});

adminFeedbackRouter.post(
  "/bulk-status",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const validIds = parsed.data.ids.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      res.json({ ok: true, affected: 0 });
      return;
    }
    const result = await Feedback.updateMany(
      { _id: { $in: validIds } },
      { $set: { status: parsed.data.status } },
    );
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "feedback.bulk-status",
      entityType: "Feedback",
      entityId: validIds.join(","),
      ip: req.ip,
    });
    res.json({ ok: true, affected: result.modifiedCount });
  }),
);

adminFeedbackRouter.delete(
  "/:id",
  requirePermission(ADMIN_PERMISSIONS.FEEDBACK_WRITE),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await Feedback.findByIdAndDelete(id);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "feedback.delete",
      entityType: "Feedback",
      entityId: id,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
