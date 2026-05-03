/**
 * Run: npx tsx src/scripts/seedTests.ts
 * Idempotent: upserts by slug.
 */
import "dotenv/config";
import { connectDb } from "../db.js";
import { Test } from "../models/Test.js";

const naturalDisaster = {
  slug: "natural-disaster-practice",
  title: "Natural Disasters – Practice",
  recommended: true,
  isActive: true,
  startAt: null as Date | null,
  durationMins: 30,
  totalMarks: 10,
  generalInstructions: [
    "This is a practice test. Rank and percentile are not shown.",
    "Read each question carefully. You can navigate between questions anytime before submission.",
    "Use “Mark for review” to return to tricky questions before you submit.",
  ].join("\n\n"),
  testInstructions: [
    "The timer starts as soon as you begin the test.",
    "Single-choice questions: select one option. You can change your answer before submitting.",
    "There is a small negative mark on wrong answers where indicated.",
    "Submit when finished; the test auto-submits when the timer ends.",
  ].join("\n\n"),
  sections: [
    { id: "sec_a", title: "General Awareness", order: 0 },
    { id: "sec_b", title: "Science", order: 1 },
  ],
  questions: [
    {
      publicId: "q1",
      sectionId: "sec_a",
      type: "single" as const,
      text: "Which of the following is a natural disaster caused by tectonic activity?",
      options: [
        { id: "a", text: "Cyclone" },
        { id: "b", text: "Earthquake" },
        { id: "c", text: "Hailstorm" },
        { id: "d", text: "Fog" },
      ],
      correctOptionId: "b",
      marks: 1,
      negativeMarks: 0.25,
      explanation: "Earthquakes are caused by movement of tectonic plates along faults.",
    },
    {
      publicId: "q2",
      sectionId: "sec_a",
      type: "single" as const,
      text: "A tsunami is most often triggered by:",
      options: [
        { id: "a", text: "Strong winds" },
        { id: "b", text: "Undersea earthquakes or landslides" },
        { id: "c", text: "Lightning" },
        { id: "d", text: "Drought" },
      ],
      correctOptionId: "b",
      marks: 1,
      negativeMarks: 0.25,
      explanation: "Displacing a large volume of water suddenly can generate tsunami waves.",
    },
    {
      publicId: "q3",
      sectionId: "sec_b",
      type: "single" as const,
      text: "The Richter scale measures:",
      options: [
        { id: "a", text: "Wind speed" },
        { id: "b", text: "Flood depth" },
        { id: "c", text: "Earthquake magnitude" },
        { id: "d", text: "Temperature" },
      ],
      correctOptionId: "c",
      marks: 1,
      negativeMarks: 0.25,
      explanation: "Richter (and modern moment magnitude) scales describe earthquake energy release.",
    },
  ],
};

const quickMath = {
  slug: "quick-math-drill-1",
  title: "Quick Math – Drill 1",
  recommended: false,
  isActive: true,
  startAt: null as Date | null,
  durationMins: 15,
  totalMarks: 0,
  generalInstructions: "Answer each question. No negative marking in this drill.",
  testInstructions: "Timer runs continuously. You may skip and return to questions using the grid.",
  sections: [{ id: "m1", title: "Arithmetic", order: 0 }],
  questions: [1, 2, 3, 4, 5].map((n) => {
    const a = n;
    const b = n + 1;
    const sum = a + b;
    return {
      publicId: `m${n}`,
      sectionId: "m1",
      type: "single" as const,
      text: `${a} + ${b} = ?`,
      options: [
        { id: "a", text: String(sum - 1) },
        { id: "b", text: String(sum) },
        { id: "c", text: String(sum + 1) },
        { id: "d", text: String(sum + 2) },
      ],
      correctOptionId: "b",
      marks: 1,
      negativeMarks: 0,
      explanation: `Addition: ${a} + ${b} = ${sum}.`,
    };
  }),
};

async function main() {
  await connectDb();
  for (const doc of [naturalDisaster, quickMath]) {
    const t = { ...doc };
    t.totalMarks = t.questions.reduce((s, q) => s + q.marks, 0);
    await Test.findOneAndUpdate(
      { slug: doc.slug },
      { $set: t },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    // eslint-disable-next-line no-console
    console.log("Upserted test:", doc.slug);
  }
  process.exit(0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
