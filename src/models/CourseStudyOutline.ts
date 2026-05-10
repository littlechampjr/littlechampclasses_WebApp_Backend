import mongoose, { Schema } from "mongoose";

const lectureVideoSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    durationSec: { type: Number, required: true, min: 0, max: 864_000 },
    videoUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    teacher: { type: Schema.Types.ObjectId, ref: "Teacher" },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const pdfResourceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    publishedAt: { type: Date, default: null },
    pdfUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    viewerMode: {
      type: String,
      enum: ["inline", "newTab"],
      default: "inline",
    },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const studyChapterSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    videoCount: { type: Number, default: 0, min: 0 },
    exerciseCount: { type: Number, default: 0, min: 0 },
    noteCount: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0 },
    lectures: { type: [lectureVideoSchema], default: [] },
    classNotes: { type: [pdfResourceSchema], default: [] },
    chapterPdfs: { type: [pdfResourceSchema], default: [] },
    dhaSolutions: { type: [pdfResourceSchema], default: [] },
  },
  { _id: true },
);

const studySubjectSchema = new Schema(
  {
    /** Stable key for tab state (e.g. "mathematics"). */
    key: { type: String, required: true, trim: true, maxlength: 64 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    sortOrder: { type: Number, default: 0 },
    chapters: { type: [studyChapterSchema], default: [] },
  },
  { _id: false },
);

/**
 * One outline per course (all batches share the same study structure).
 * For batch-specific overrides later, add optional `batch` + compound unique index.
 */
const courseStudyOutlineSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      unique: true,
      index: true,
    },
    subjects: { type: [studySubjectSchema], default: [] },
  },
  { timestamps: true },
);

export type CourseStudyOutlineDoc = mongoose.InferSchemaType<typeof courseStudyOutlineSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CourseStudyOutline = mongoose.model("CourseStudyOutline", courseStudyOutlineSchema);
