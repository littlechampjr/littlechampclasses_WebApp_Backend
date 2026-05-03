import mongoose, { Schema } from "mongoose";

const courseBatchSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true, uppercase: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

courseBatchSchema.index({ course: 1, code: 1 }, { unique: true });
courseBatchSchema.index({ course: 1, isActive: 1 });

export type CourseBatchDoc = mongoose.InferSchemaType<typeof courseBatchSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const CourseBatch = mongoose.model("CourseBatch", courseBatchSchema);
