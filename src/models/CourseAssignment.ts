import mongoose, { Schema } from "mongoose";

/** Homework-style attachments (PDF/link), distinct from MCQ `Test` documents. */
const courseAssignmentSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "CourseBatch", default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", trim: true, maxlength: 12000 },
    dueAt: { type: Date, required: true, index: true },
    attachmentUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

courseAssignmentSchema.index({ course: 1, dueAt: -1 });

export type CourseAssignmentDoc = mongoose.InferSchemaType<typeof courseAssignmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CourseAssignment = mongoose.model("CourseAssignment", courseAssignmentSchema);
