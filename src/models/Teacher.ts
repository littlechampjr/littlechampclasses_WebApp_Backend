import mongoose, { Schema } from "mongoose";

const teacherSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "", trim: true },
    /** Short bio line for cards (optional). */
    bioLine: { type: String, default: "", trim: true, maxlength: 280 },
    /** Subject tags for admin CMS (e.g. Mathematics, English). */
    subjectExpertise: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type TeacherDoc = mongoose.InferSchemaType<typeof teacherSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Teacher = mongoose.model("Teacher", teacherSchema);
