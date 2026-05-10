import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { Test } from "../../models/Test.js";
import { writeAdminAudit } from "../../services/auditService.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminTestsRouter = Router();

adminTestsRouter.use(requireAdminAuth);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(200).optional(),
});

adminTestsRouter.get(
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
      filter.$or = [{ title: rx }, { slug: rx }];
    }
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      Test.countDocuments(filter),
      Test.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.json({
      total,
      page,
      limit,
      tests: rows.map((t) => ({
        id: t._id.toString(),
        slug: t.slug,
        title: t.title,
        isActive: t.isActive !== false,
        recommended: Boolean(t.recommended),
        durationMins: t.durationMins,
        totalMarks: t.totalMarks,
        courseIds: (t.courseIds ?? []).map(String),
        updatedAt: t.updatedAt,
      })),
    });
  }),
);

const optionZ = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(2000),
});

const questionZ = z.object({
  publicId: z.string().min(1).max(120),
  sectionId: z.string().min(1).max(120),
  type: z.literal("single"),
  text: z.string().min(1).max(4000),
  options: z.array(optionZ).min(2),
  correctOptionId: z.string().min(1).max(64),
  marks: z.number().min(0),
  negativeMarks: z.number().min(0).optional(),
  explanation: z.string().max(8000).optional(),
});

const sectionZ = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  order: z.number().optional(),
});

const testUpsertBody = z.object({
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  courseIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional(),
  recommended: z.boolean().optional(),
  startAt: z.union([z.string(), z.null()]).optional(),
  durationMins: z.number().min(1).max(600),
  totalMarks: z.number().min(1),
  attemptsCount: z.number().min(0).optional(),
  generalInstructions: z.string().max(12000).optional(),
  testInstructions: z.string().max(12000).optional(),
  sections: z.array(sectionZ).optional().default([]),
  questions: z.array(questionZ).min(1),
});

adminTestsRouter.post(
  "/",
  requirePermission(ADMIN_PERMISSIONS.TESTS_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = testUpsertBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const courseIds = b.courseIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    try {
      const doc = await Test.create({
        slug: b.slug.trim(),
        title: b.title,
        courseIds,
        isActive: b.isActive !== false,
        recommended: Boolean(b.recommended),
        startAt: b.startAt ? new Date(b.startAt) : null,
        durationMins: b.durationMins,
        totalMarks: b.totalMarks,
        attemptsCount: b.attemptsCount ?? 0,
        generalInstructions: b.generalInstructions ?? "",
        testInstructions: b.testInstructions ?? "",
        sections: b.sections.map((s) => ({
          id: s.id,
          title: s.title,
          order: s.order ?? 0,
        })),
        questions: b.questions.map((q) => ({
          publicId: q.publicId,
          sectionId: q.sectionId,
          type: "single" as const,
          text: q.text,
          options: q.options,
          correctOptionId: q.correctOptionId,
          marks: q.marks,
          negativeMarks: q.negativeMarks ?? 0,
          explanation: q.explanation ?? "",
        })),
      });
      await writeAdminAudit({
        actorAdminId: req.admin!.id,
        action: "test.create",
        entityType: "Test",
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

adminTestsRouter.get(
  "/:testId",
  requirePermission(ADMIN_PERMISSIONS.COURSES_READ),
  asyncHandler(async (req, res) => {
    const { testId } = req.params;
    if (!mongoose.isValidObjectId(testId)) {
      res.status(400).json({ error: "Invalid test id" });
      return;
    }
    const t = await Test.findById(testId).lean();
    if (!t) {
      res.status(404).json({ error: "Test not found" });
      return;
    }
    res.json({ test: t });
  }),
);

adminTestsRouter.put(
  "/:testId",
  requirePermission(ADMIN_PERMISSIONS.TESTS_WRITE),
  asyncHandler(async (req, res) => {
    const { testId } = req.params;
    if (!mongoose.isValidObjectId(testId)) {
      res.status(400).json({ error: "Invalid test id" });
      return;
    }
    const parsed = testUpsertBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const b = parsed.data;
    const courseIds = b.courseIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));

    try {
      const updated = await Test.findOneAndUpdate(
        { _id: testId },
        {
          $set: {
            slug: b.slug.trim(),
            title: b.title,
            courseIds,
            isActive: b.isActive !== false,
            recommended: Boolean(b.recommended),
            startAt: b.startAt ? new Date(b.startAt) : null,
            durationMins: b.durationMins,
            totalMarks: b.totalMarks,
            attemptsCount: b.attemptsCount ?? 0,
            generalInstructions: b.generalInstructions ?? "",
            testInstructions: b.testInstructions ?? "",
            sections: b.sections.map((s) => ({
              id: s.id,
              title: s.title,
              order: s.order ?? 0,
            })),
            questions: b.questions.map((q) => ({
              publicId: q.publicId,
              sectionId: q.sectionId,
              type: "single" as const,
              text: q.text,
              options: q.options,
              correctOptionId: q.correctOptionId,
              marks: q.marks,
              negativeMarks: q.negativeMarks ?? 0,
              explanation: q.explanation ?? "",
            })),
          },
        },
        { new: true },
      ).lean();

      if (!updated) {
        res.status(404).json({ error: "Test not found" });
        return;
      }

      await writeAdminAudit({
        actorAdminId: req.admin!.id,
        action: "test.replace",
        entityType: "Test",
        entityId: testId,
        summary: b.slug,
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

adminTestsRouter.delete(
  "/:testId",
  requirePermission(ADMIN_PERMISSIONS.TESTS_WRITE),
  asyncHandler(async (req, res) => {
    const { testId } = req.params;
    if (!mongoose.isValidObjectId(testId)) {
      res.status(400).json({ error: "Invalid test id" });
      return;
    }
    await Test.findByIdAndDelete(testId);
    await writeAdminAudit({
      actorAdminId: req.admin!.id,
      action: "test.delete",
      entityType: "Test",
      entityId: testId,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);
