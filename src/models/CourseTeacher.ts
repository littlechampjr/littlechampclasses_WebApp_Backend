import mongoose, { Schema } from "mongoose";

/** Links a reusable Teacher to a Course with a subject line for UI cards. */
const courseTeacherSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true, index: true },
    subjectLabel: { type: String, required: true, trim: true, maxlength: 120 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

courseTeacherSchema.index({ course: 1, sortOrder: 1 });

export type CourseTeacherDoc = mongoose.InferSchemaType<typeof courseTeacherSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CourseTeacher = mongoose.model("CourseTeacher", courseTeacherSchema);
