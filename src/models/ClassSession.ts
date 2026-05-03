import mongoose, { Schema } from "mongoose";

const classSessionSchema = new Schema(
  {
    batch: { type: Schema.Types.ObjectId, ref: "CourseBatch", required: true, index: true },
    startsAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    subject: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    teacherName: { type: String, default: "", trim: true },
    teacherImageUrl: { type: String, default: "", trim: true },
    statusMicrocopy: { type: String, default: "", trim: true, maxlength: 280 },
    hasAttachments: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

classSessionSchema.index({ batch: 1, startsAt: 1 });

export type ClassSessionDoc = mongoose.InferSchemaType<typeof classSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ClassSession = mongoose.model("ClassSession", classSessionSchema);
