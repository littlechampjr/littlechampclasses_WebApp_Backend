import { Router } from "express";
import { Types } from "mongoose";
import { Test } from "../models/Test.js";
import { TestAttempt } from "../models/TestAttempt.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  buildEmptyAnswers,
  scoreAttempt,
  toPublicQuestion,
  type SubmittedAnswerInput,
} from "../services/testScoringService.js";
import type { TestDoc } from "../models/Test.js";

function isOid(id: string) {
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
}

function mapListItem(t: {
  _id: Types.ObjectId;
  title: string;
  durationMins: number;
  totalMarks: number;
  attemptsCount: number;
  startAt?: Date | null;
  recommended: boolean;
  questions: { publicId: string }[];
}) {
  return {
    id: t._id.toString(),
    title: t.title,
    questionCount: t.questions.length,
    totalMarks: t.totalMarks,
    durationMins: t.durationMins,
    attemptsCount: t.attemptsCount ?? 0,
    startAt: t.startAt != null ? new Date(t.startAt).toISOString() : null,
    recommended: Boolean(t.recommended),
  };
}

function applySubmitResult(
  // Mongoose document — use loose typing so scored arrays assign cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  att: any,
  test: TestDoc,
  answers: SubmittedAnswerInput[],
  submittedAt: Date,
) {
  const scored = scoreAttempt(test, answers, submittedAt, new Date(att.startedAt));
  att.status = "submitted";
  att.submittedAt = submittedAt;
  att.answers = answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionId: a.selectedOptionId,
    timeSpentSec: Math.max(0, a.timeSpentSec ?? 0),
  }));
  att.result = {
    totalScore: scored.totalScore,
    maxScore: scored.maxScore,
    correct: scored.correct,
    incorrect: scored.incorrect,
    skipped: scored.skipped,
    accuracyPct: scored.accuracyPct,
    completionPct: scored.completionPct,
    timeTakenSec: scored.timeTakenSec,
    sectionRows: scored.sectionRows,
    perQuestion: scored.perQuestion,
  };
}

export const testsRouter = Router();

/** Public list: active tests only. */
testsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const rows = await Test.find({
      isActive: true,
      $or: [{ startAt: null }, { startAt: { $lte: now } }],
    })
      .select(
        "title durationMins totalMarks attemptsCount startAt recommended questions",
      )
      .sort({ recommended: -1, updatedAt: -1 })
      .lean();
    res.json({ tests: rows.map(mapListItem) });
  }),
);

/** Load attempt (in progress → questions; submitted → 409). */
testsRouter.get(
  "/attempts/:attemptId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { attemptId } = req.params;
    if (!isOid(attemptId)) {
      res.status(400).json({ error: "Invalid attempt id" });
      return;
    }
    const att = await TestAttempt.findById(attemptId);
    if (!att || String(att.user) !== userId) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    const test = await Test.findById(att.test);
    if (!test || !test.isActive) {
      res.status(404).json({ error: "Test not found" });
      return;
    }
    if (att.status === "submitted") {
      res.status(409).json({ error: "Already submitted", resultUrl: "result" });
      return;
    }
    if (new Date() > att.endsAt) {
      applySubmitResult(att, test, buildEmptyAnswers(test), new Date());
      await att.save();
      res.json({
        finalized: true,
        attempt: {
          id: att._id.toString(),
          testId: test._id.toString(),
          status: att.status,
        },
      });
      return;
    }
    res.json({
      attempt: {
        id: att._id.toString(),
        testId: test._id.toString(),
        testTitle: test.title,
        status: att.status,
        startedAt: att.startedAt.toISOString(),
        endsAt: att.endsAt.toISOString(),
      },
      questions: toPublicQuestion(test),
    });
  }),
);

type SubmitBody = { answers: SubmittedAnswerInput[] };

testsRouter.post(
  "/attempts/:attemptId/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { attemptId } = req.params;
    if (!isOid(attemptId)) {
      res.status(400).json({ error: "Invalid attempt id" });
      return;
    }
    const body = req.body as SubmitBody;
    if (!body || !Array.isArray(body.answers)) {
      res.status(400).json({ error: "answers required" });
      return;
    }

    const att = await TestAttempt.findById(attemptId);
    if (!att || String(att.user) !== userId) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if (att.status === "submitted") {
      res.status(409).json({ error: "Already submitted" });
      return;
    }

    const test = await Test.findById(att.test);
    if (!test) {
      res.status(404).json({ error: "Test not found" });
      return;
    }

    const submittedAt = new Date();
    applySubmitResult(att, test, body.answers, submittedAt);
    await att.save();
    res.json({ ok: true, attemptId: att._id.toString() });
  }),
);

testsRouter.get(
  "/attempts/:attemptId/result",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { attemptId } = req.params;
    if (!isOid(attemptId)) {
      res.status(400).json({ error: "Invalid attempt id" });
      return;
    }
    const att = await TestAttempt.findById(attemptId);
    if (!att || String(att.user) !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (att.status !== "submitted" || !att.result) {
      res.status(400).json({ error: "Result not available yet" });
      return;
    }
    const test = await Test.findById(att.test).lean();
    if (!test) {
      res.status(404).json({ error: "Test not found" });
      return;
    }

    const per = att.result.perQuestion ?? [];
    const explanations: Record<string, string> = {};
    for (const q of test.questions) {
      explanations[q.publicId] = q.explanation ?? "";
    }

    res.json({
      attemptId: att._id.toString(),
      test: {
        id: test._id.toString(),
        title: test.title,
      },
      summary: {
        totalScore: att.result.totalScore,
        maxScore: att.result.maxScore,
        correct: att.result.correct,
        incorrect: att.result.incorrect,
        skipped: att.result.skipped,
        accuracyPct: att.result.accuracyPct,
        completionPct: att.result.completionPct,
        timeTakenSec: att.result.timeTakenSec,
      },
      sectionRows: att.result.sectionRows,
      perQuestion: per.map((p) => ({
        ...p,
        explanation: explanations[p.questionId] ?? "",
      })),
    });
  }),
);

type FeedbackBody = { rating: number | null; skipped: boolean };

testsRouter.post(
  "/attempts/:attemptId/feedback",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { attemptId } = req.params;
    if (!isOid(attemptId)) {
      res.status(400).json({ error: "Invalid attempt id" });
      return;
    }
    const b = req.body as FeedbackBody;
    const att = await TestAttempt.findById(attemptId);
    if (!att || String(att.user) !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (att.status !== "submitted") {
      res.status(400).json({ error: "Submit test before feedback" });
      return;
    }
    if (b.skipped) {
      att.feedback = { rating: null, skipped: true };
    } else if (b.rating != null && b.rating >= 1 && b.rating <= 5) {
      att.feedback = { rating: b.rating, skipped: false };
    } else {
      att.feedback = { rating: null, skipped: true };
    }
    await att.save();
    res.json({ ok: true });
  }),
);

/** Review: full questions + user selections + correct + explanations. */
testsRouter.get(
  "/attempts/:attemptId/review",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { attemptId } = req.params;
    if (!isOid(attemptId)) {
      res.status(400).json({ error: "Invalid attempt id" });
      return;
    }
    const att = await TestAttempt.findById(attemptId);
    if (!att || String(att.user) !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (att.status !== "submitted" || !att.result) {
      res.status(400).json({ error: "Result not available yet" });
      return;
    }
    const test = await Test.findById(att.test).lean();
    if (!test) {
      res.status(404).json({ error: "Test not found" });
      return;
    }

    const byResult = new Map(
      (att.result.perQuestion ?? []).map((p) => [p.questionId, p] as const),
    );

    const questions = test.questions.map((q) => {
      const r = byResult.get(q.publicId);
      return {
        id: q.publicId,
        sectionId: q.sectionId,
        type: q.type,
        text: q.text,
        options: q.options,
        correctOptionId: q.correctOptionId,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        selectedOptionId: r?.selectedOptionId ?? null,
        status: r?.status ?? "skipped",
        timeSpentSec: r?.timeSpentSec ?? 0,
        explanation: q.explanation ?? "",
      };
    });

    res.json({
      attemptId: att._id.toString(),
      test: { id: test._id.toString(), title: test.title },
      questions,
    });
  }),
);

/** Instructions + metadata; no questions. Register after /attempts/* so "attempts" is not captured. */
testsRouter.get(
  "/:testId",
  asyncHandler(async (req, res) => {
    const { testId } = req.params;
    if (!isOid(testId)) {
      res.status(400).json({ error: "Invalid test id" });
      return;
    }
    const t = await Test.findOne({ _id: testId, isActive: true }).lean();
    if (!t) {
      res.status(404).json({ error: "Test not found" });
      return;
    }
    if (t.startAt && new Date() < new Date(t.startAt)) {
      res.status(403).json({ error: "This test is not open yet" });
      return;
    }
    res.json({
      test: {
        id: t._id.toString(),
        title: t.title,
        questionCount: t.questions.length,
        totalMarks: t.totalMarks,
        durationMins: t.durationMins,
        startAt: t.startAt ? new Date(t.startAt).toISOString() : null,
        generalInstructions: t.generalInstructions ?? "",
        testInstructions: t.testInstructions ?? "",
        sections: (t.sections ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          order: s.order,
        })),
        attemptsCount: t.attemptsCount ?? 0,
      },
    });
  }),
);

/** Start or resume an in-progress attempt. */
testsRouter.post(
  "/:testId/attempts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { testId } = req.params;
    if (!isOid(testId)) {
      res.status(400).json({ error: "Invalid test id" });
      return;
    }
    const test = await Test.findOne({ _id: testId, isActive: true });
    if (!test) {
      res.status(404).json({ error: "Test not found" });
      return;
    }
    if (test.startAt && new Date() < new Date(test.startAt)) {
      res.status(403).json({ error: "This test is not open yet" });
      return;
    }

    const existing = await TestAttempt.findOne({
      user: userId,
      test: test._id,
      status: "in_progress",
    });
    if (existing) {
      if (new Date() <= existing.endsAt) {
        res.json({
          attempt: {
            id: existing._id.toString(),
            testId: test._id.toString(),
            status: existing.status,
            startedAt: existing.startedAt.toISOString(),
            endsAt: existing.endsAt.toISOString(),
          },
          questions: toPublicQuestion(test),
        });
        return;
      }
      applySubmitResult(existing, test, buildEmptyAnswers(test), new Date());
      await existing.save();
    }

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() + test.durationMins * 60 * 1000,
    );
    const attempt = await TestAttempt.create({
      user: userId,
      test: test._id,
      status: "in_progress",
      startedAt,
      endsAt,
    });
    await Test.updateOne(
      { _id: test._id },
      { $inc: { attemptsCount: 1 } },
    );
    res.status(201).json({
      attempt: {
        id: attempt._id.toString(),
        testId: test._id.toString(),
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        endsAt: attempt.endsAt.toISOString(),
      },
      questions: toPublicQuestion(test),
    });
  }),
);
