import type { TestDoc } from "../models/Test.js";

export type SubmittedAnswerInput = {
  questionId: string;
  selectedOptionId: string | null;
  timeSpentSec: number;
};

type QuestionLean = {
  publicId: string;
  sectionId: string;
  correctOptionId: string;
  marks: number;
  negativeMarks: number;
};

type SectionRow = {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracyPct: number;
  timeTakenSec: number;
};

type PerQuestionRow = {
  questionId: string;
  status: "correct" | "incorrect" | "skipped";
  selectedOptionId: string | null;
  correctOptionId: string;
  marksAwarded: number;
  timeSpentSec: number;
};

export type ScoringResult = {
  totalScore: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracyPct: number;
  completionPct: number;
  timeTakenSec: number;
  sectionRows: SectionRow[];
  perQuestion: PerQuestionRow[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildQuestionMap(test: TestDoc): Map<string, QuestionLean> {
  const map = new Map<string, QuestionLean>();
  for (const q of test.questions) {
    map.set(q.publicId, {
      publicId: q.publicId,
      sectionId: q.sectionId,
      correctOptionId: q.correctOptionId,
      marks: q.marks,
      negativeMarks: q.negativeMarks ?? 0,
    });
  }
  return map;
}

export function scoreAttempt(
  test: TestDoc,
  answers: SubmittedAnswerInput[],
  submittedAt: Date,
  startedAt: Date,
): ScoringResult {
  const byId = buildQuestionMap(test);
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

  let totalScore = 0;
  let maxScore = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let timeTakenSec = 0;

  const perQuestion: PerQuestionRow[] = [];

  const sectionMax = new Map<string, number>();
  const sectionScore = new Map<string, number>();
  const sectionCorrect = new Map<string, number>();
  const sectionIncorrect = new Map<string, number>();
  const sectionSkipped = new Map<string, number>();

  const titleBySection = new Map(
    (test.sections ?? []).map((s) => [s.id, s.title] as const),
  );

  for (const q of test.questions) {
    maxScore += q.marks;
    const sId = q.sectionId;
    sectionMax.set(sId, (sectionMax.get(sId) ?? 0) + q.marks);
  }

  for (const q of test.questions) {
    const sub = answerByQ.get(q.publicId);
    const t = sub?.timeSpentSec ?? 0;
    timeTakenSec += t;

    const rowBase = {
      questionId: q.publicId,
      correctOptionId: q.correctOptionId,
      timeSpentSec: t,
    } as const;

    const sId = q.sectionId;
    if (!sub || sub.selectedOptionId == null || sub.selectedOptionId === "") {
      skipped += 1;
      perQuestion.push({
        ...rowBase,
        status: "skipped",
        selectedOptionId: null,
        marksAwarded: 0,
      });
      sectionSkipped.set(sId, (sectionSkipped.get(sId) ?? 0) + 1);
      continue;
    }

    if (sub.selectedOptionId === q.correctOptionId) {
      correct += 1;
      const awarded = q.marks;
      totalScore += awarded;
      perQuestion.push({
        ...rowBase,
        status: "correct",
        selectedOptionId: sub.selectedOptionId,
        marksAwarded: round2(awarded),
      });
      sectionScore.set(sId, (sectionScore.get(sId) ?? 0) + awarded);
      sectionCorrect.set(sId, (sectionCorrect.get(sId) ?? 0) + 1);
    } else {
      incorrect += 1;
      const neg = q.negativeMarks ?? 0;
      const awarded = -neg;
      totalScore += awarded;
      perQuestion.push({
        ...rowBase,
        status: "incorrect",
        selectedOptionId: sub.selectedOptionId,
        marksAwarded: round2(awarded),
      });
      sectionScore.set(sId, (sectionScore.get(sId) ?? 0) + awarded);
      sectionIncorrect.set(sId, (sectionIncorrect.get(sId) ?? 0) + 1);
    }
  }

  // Clamp total score
  if (totalScore < 0) totalScore = 0;
  totalScore = round2(totalScore);
  maxScore = round2(maxScore);

  const answered = correct + incorrect;
  const accuracyPct = answered > 0 ? round2((correct / answered) * 100) : 0;
  const completionPct = test.questions.length
    ? round2((answered / test.questions.length) * 100)
    : 0;

  const wallSec = Math.max(0, Math.floor((+submittedAt - +startedAt) / 1000));
  // Prefer sum of per-question focus time if meaningful; else wall clock
  if (timeTakenSec <= 0) {
    timeTakenSec = wallSec;
  } else {
    timeTakenSec = Math.min(wallSec, timeTakenSec);
  }

  const sectionRows: SectionRow[] = [];
  for (const [sid, smax] of sectionMax) {
    const c = sectionCorrect.get(sid) ?? 0;
    const inc = sectionIncorrect.get(sid) ?? 0;
    const sk = sectionSkipped.get(sid) ?? 0;
    const sanswered = c + inc;
    const sAcc = sanswered > 0 ? round2((c / sanswered) * 100) : 0;
    let st = 0;
    for (const pq of perQuestion) {
      const meta = byId.get(pq.questionId);
      if (meta?.sectionId === sid) st += pq.timeSpentSec;
    }
    sectionRows.push({
      sectionId: sid,
      title: titleBySection.get(sid) ?? "Section",
      score: round2(sectionScore.get(sid) ?? 0),
      maxScore: smax,
      correct: c,
      incorrect: inc,
      skipped: sk,
      accuracyPct: sAcc,
      timeTakenSec: st,
    });
  }
  sectionRows.sort((a, b) => a.sectionId.localeCompare(b.sectionId));

  return {
    totalScore,
    maxScore,
    correct,
    incorrect,
    skipped,
    accuracyPct,
    completionPct,
    timeTakenSec: Math.max(0, Math.floor(timeTakenSec)),
    sectionRows,
    perQuestion,
  };
}

export function buildEmptyAnswers(test: TestDoc): SubmittedAnswerInput[] {
  return test.questions.map((q) => ({
    questionId: q.publicId,
    selectedOptionId: null,
    timeSpentSec: 0,
  }));
}

export function toPublicQuestion(test: TestDoc) {
  return test.questions.map((q) => ({
    id: q.publicId,
    sectionId: q.sectionId,
    type: q.type as "single",
    text: q.text,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    marks: q.marks,
    negativeMarks: q.negativeMarks ?? 0,
  }));
}
