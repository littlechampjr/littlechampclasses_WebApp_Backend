import mongoose, { Schema } from "mongoose";

const optionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false },
);

const testQuestionSchema = new Schema(
  {
    publicId: { type: String, required: true, trim: true },
    sectionId: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["single"] },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    options: { type: [optionSchema], required: true },
    correctOptionId: { type: String, required: true, trim: true },
    marks: { type: Number, required: true, min: 0 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    explanation: { type: String, default: "", trim: true, maxlength: 8000 },
  },
  { _id: false },
);

const testSectionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const testSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 160 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    isActive: { type: Boolean, default: true, index: true },
    /** Highlight in “Recommended” tab. */
    recommended: { type: Boolean, default: false, index: true },
    startAt: { type: Date, default: null },
    durationMins: { type: Number, required: true, min: 1, max: 600 },
    /** Sum of per-question max marks; denormalized for list cards. */
    totalMarks: { type: Number, required: true, min: 1 },
    attemptsCount: { type: Number, default: 0, min: 0 },
    generalInstructions: { type: String, default: "", trim: true, maxlength: 12000 },
    testInstructions: { type: String, default: "", trim: true, maxlength: 12000 },
    sections: { type: [testSectionSchema], default: [] },
    questions: { type: [testQuestionSchema], required: true, validate: [(v: unknown[]) => v.length > 0, "at least 1"] },
  },
  { timestamps: true },
);

export type TestDoc = mongoose.InferSchemaType<typeof testSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Test = mongoose.model("Test", testSchema);
