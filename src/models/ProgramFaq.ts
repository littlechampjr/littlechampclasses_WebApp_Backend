import mongoose, { Schema } from "mongoose";

/** Reusable FAQ entries; `courseIds` lists all programs this applies to. */
const programFaqSchema = new Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer: { type: String, required: true, trim: true, maxlength: 12000 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    courseIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Course", index: true }],
      default: [],
    },
  },
  { timestamps: true },
);

programFaqSchema.index({ courseIds: 1, isActive: 1, sortOrder: 1 });

export type ProgramFaqDoc = mongoose.InferSchemaType<typeof programFaqSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProgramFaq = mongoose.model("ProgramFaq", programFaqSchema);
