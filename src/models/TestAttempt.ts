import mongoose, { Schema } from "mongoose";

const submittedAnswerSchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true },
    selectedOptionId: { type: String, default: null, trim: true },
    timeSpentSec: { type: Number, default: 0, min: 0, max: 86_400 },
  },
  { _id: false },
);

const testAttemptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    test: { type: Schema.Types.ObjectId, ref: "Test", required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["in_progress", "submitted"],
      default: "in_progress",
      index: true,
    },
    startedAt: { type: Date, required: true },
    /** Inclusive end for countdown (server source of truth). */
    endsAt: { type: Date, required: true, index: true },
    submittedAt: { type: Date, default: null },
    answers: { type: [submittedAnswerSchema], default: [] },
    result: {
      type: {
        totalScore: { type: Number, required: true },
        maxScore: { type: Number, required: true },
        correct: { type: Number, required: true, min: 0 },
        incorrect: { type: Number, required: true, min: 0 },
        skipped: { type: Number, required: true, min: 0 },
        accuracyPct: { type: Number, required: true, min: 0, max: 100 },
        completionPct: { type: Number, required: true, min: 0, max: 100 },
        timeTakenSec: { type: Number, required: true, min: 0, max: 86_400 },
        sectionRows: {
          type: [
            {
              sectionId: { type: String, required: true },
              title: { type: String, required: true },
              score: { type: Number, required: true },
              maxScore: { type: Number, required: true },
              correct: { type: Number, required: true, min: 0 },
              incorrect: { type: Number, required: true, min: 0 },
              skipped: { type: Number, required: true, min: 0 },
              accuracyPct: { type: Number, required: true, min: 0, max: 100 },
              timeTakenSec: { type: Number, required: true, min: 0, max: 86_400 },
            },
          ],
          default: undefined,
        },
        perQuestion: {
          type: [
            {
              questionId: { type: String, required: true },
              status: { type: String, enum: ["correct", "incorrect", "skipped"] },
              selectedOptionId: { type: String, default: null },
              correctOptionId: { type: String, required: true },
              marksAwarded: { type: Number, required: true },
              timeSpentSec: { type: Number, default: 0, min: 0, max: 86_400 },
            },
          ],
          default: undefined,
        },
      },
      default: null,
    },
    feedback: {
      rating: { type: Number, default: null, min: 1, max: 5 },
      skipped: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

testAttemptSchema.index({ user: 1, test: 1, status: 1, createdAt: -1 });

export type TestAttemptDoc = mongoose.InferSchemaType<typeof testAttemptSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TestAttempt = mongoose.model("TestAttempt", testAttemptSchema);
