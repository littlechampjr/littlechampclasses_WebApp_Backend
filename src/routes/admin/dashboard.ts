import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { AdminAuditLog } from "../../models/AdminAuditLog.js";
import { BookDemoEnrollment } from "../../models/BookDemoEnrollment.js";
import { Course } from "../../models/Course.js";
import { CoursePurchase } from "../../models/CoursePurchase.js";
import { Enrollment } from "../../models/Enrollment.js";
import { User } from "../../models/User.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(requireAdminAuth);

adminDashboardRouter.get(
  "/metrics/summary",
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  asyncHandler(async (_req, res) => {
    const paidDistinct = await CoursePurchase.distinct("user", { status: "paid" });
    const paidOidList = paidDistinct
      .filter((id) => mongoose.isValidObjectId(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    const paidAgg = await CoursePurchase.aggregate<{ n: number }>([
      { $match: { status: "paid" } },
      { $group: { _id: "$user" } },
      { $count: "n" },
    ]);
    const paidUsers = paidAgg[0]?.n ?? 0;

    const [totalUsers, unpaidUsers, demoCount, activeCourses] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments(
        paidOidList.length === 0 ? {} : { _id: { $nin: paidOidList } },
      ),
      BookDemoEnrollment.countDocuments({
        status: { $in: ["otp_verified", "payment_pending", "paid"] },
      }),
      Course.countDocuments({
        isActive: true,
        status: { $nin: ["draft"] },
      }),
    ]);

    res.json({
      totalUsers,
      paidUsers,
      unpaidUsers,
      demoEnrolledUsers: demoCount,
      activeCourses,
    });
  }),
);

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

adminDashboardRouter.get(
  "/metrics/enrollments-timeseries",
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  asyncHandler(async (req, res) => {
    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "from and to must be valid dates (ISO)" });
      return;
    }
    const { from, to } = parsed.data;
    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: "from must be before to" });
      return;
    }

    const pipeline: mongoose.PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1 as const, "_id.m": 1 as const, "_id.d": 1 as const } },
    ];

    const rows = await Enrollment.aggregate<{ _id: { y: number; m: number; d: number }; count: number }>(
      pipeline,
    );

    res.json({
      points: rows.map((r) => ({
        date: `${String(r._id.y).padStart(4, "0")}-${String(r._id.m).padStart(2, "0")}-${String(r._id.d).padStart(2, "0")}`,
        count: r.count,
      })),
    });
  }),
);

adminDashboardRouter.get(
  "/metrics/revenue-timeseries",
  requirePermission(ADMIN_PERMISSIONS.METRICS_READ),
  asyncHandler(async (req, res) => {
    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "from and to must be valid dates (ISO)" });
      return;
    }
    const { from, to } = parsed.data;
    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: "from must be before to" });
      return;
    }

    const pipeline: mongoose.PipelineStage[] = [
      {
        $match: {
          status: "paid",
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          amountPaise: { $sum: "$amountPaise" },
        },
      },
      { $sort: { "_id.y": 1 as const, "_id.m": 1 as const, "_id.d": 1 as const } },
    ];

    const rows = await CoursePurchase.aggregate<{
      _id: { y: number; m: number; d: number };
      amountPaise: number;
    }>(pipeline);

    res.json({
      points: rows.map((r) => ({
        date: `${String(r._id.y).padStart(4, "0")}-${String(r._id.m).padStart(2, "0")}-${String(r._id.d).padStart(2, "0")}`,
        amountPaise: r.amountPaise,
        amountRupees: r.amountPaise / 100,
      })),
    });
  }),
);

const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

adminDashboardRouter.get(
  "/activity/recent-enrollments",
  requirePermission(ADMIN_PERMISSIONS.ACTIVITY_READ),
  asyncHandler(async (req, res) => {
    const parsed = pagination.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { limit, cursor } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (cursor && mongoose.isValidObjectId(cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const rows = await Enrollment.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "user", select: "phoneE164 childName" })
      .populate({ path: "batch", select: "code course", populate: { path: "course", select: "title slug" } })
      .lean();

    const slice = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? String(rows[limit]!._id) : null;

    res.json({
      items: slice.map((e) => ({
        id: e._id.toString(),
        createdAt: e.createdAt,
        userId: String(e.user),
        userPhone: (e.user as { phoneE164?: string } | null)?.phoneE164 ?? "",
        childName: (e.user as { childName?: string } | null)?.childName ?? "",
        batchCode: (e.batch as { code?: string } | null)?.code ?? "",
        courseTitle: (e.batch as { course?: { title?: string } } | null)?.course?.title ?? "",
      })),
      nextCursor,
    });
  }),
);

adminDashboardRouter.get(
  "/activity/recent-payments",
  requirePermission(ADMIN_PERMISSIONS.ACTIVITY_READ),
  asyncHandler(async (req, res) => {
    const parsed = pagination.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { limit, cursor } = parsed.data;
    const filter: Record<string, unknown> = { status: "paid" };
    if (cursor && mongoose.isValidObjectId(cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const rows = await CoursePurchase.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "user", select: "phoneE164 childName" })
      .populate({ path: "course", select: "title slug" })
      .lean();

    const slice = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? String(rows[limit]!._id) : null;

    res.json({
      items: slice.map((p) => ({
        id: p._id.toString(),
        createdAt: p.createdAt,
        amountPaise: p.amountPaise,
        amountRupees: p.amountPaise / 100,
        couponCode: p.couponCode,
        userId: String(p.user),
        userPhone: (p.user as { phoneE164?: string } | null)?.phoneE164 ?? "",
        courseTitle: (p.course as { title?: string } | null)?.title ?? "",
      })),
      nextCursor,
    });
  }),
);

adminDashboardRouter.get(
  "/audit-logs",
  requirePermission(ADMIN_PERMISSIONS.AUDIT_READ),
  asyncHandler(async (req, res) => {
    const parsed = pagination.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { limit, cursor } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (cursor && mongoose.isValidObjectId(cursor)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const rows = await AdminAuditLog.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "actorAdminId", select: "email" })
      .lean();

    const slice = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? String(rows[limit]!._id) : null;

    res.json({
      items: slice.map((r) => ({
        id: r._id.toString(),
        createdAt: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        actorEmail: (r.actorAdminId as { email?: string } | null)?.email ?? "",
      })),
      nextCursor,
    });
  }),
);
