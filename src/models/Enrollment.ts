import mongoose, { Schema } from "mongoose";

const STATUS = ["active", "cancelled", "expired"] as const;
const SOURCE = ["book_demo", "program", "admin"] as const;

const enrollmentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "CourseBatch", required: true, index: true },
    status: { type: String, enum: STATUS, default: "active", index: true },
    source: { type: String, enum: SOURCE, required: true },
    purchasedAt: { type: Date, required: true },
    bookDemoEnrollment: {
      type: Schema.Types.ObjectId,
      ref: "BookDemoEnrollment",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

enrollmentSchema.index({ user: 1, batch: 1 }, { unique: true });

export type EnrollmentDoc = mongoose.InferSchemaType<typeof enrollmentSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
