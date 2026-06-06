import mongoose, { Schema } from "mongoose";

const teacherSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "", trim: true },
    /** Short bio line for cards (optional). */
    bioLine: { type: String, default: "", trim: true, maxlength: 280 },
    /** Subject tags for admin CMS (e.g. Mathematics, English). */
    subjectExpertise: { type: [String], default: [] },
    /** Subheader shown in the public "Know More" modal, e.g. "Expertise in Mathematics". */
    modalTagline: { type: String, default: "", trim: true, maxlength: 200 },
    /** Bullet points shown in the modal (the ✨ list). */
    highlights: { type: [String], default: [] },
    /** Lower values appear first on the public carousel. */
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type TeacherDoc = mongoose.InferSchemaType<typeof teacherSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Teacher = mongoose.model("Teacher", teacherSchema);
