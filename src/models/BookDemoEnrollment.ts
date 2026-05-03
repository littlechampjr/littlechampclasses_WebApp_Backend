import mongoose, { Schema } from "mongoose";

const STATUS = ["draft", "otp_verified", "payment_pending", "paid", "failed", "cancelled"] as const;

const bookDemoEnrollmentSchema = new Schema(
  {
    phoneE164: { type: String, required: true, index: true, trim: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "CourseBatch", required: true },
    /** Class / grade band 1–9 */
    grade: { type: Number, required: true, min: 1, max: 9 },
    status: { type: String, enum: STATUS, default: "draft" },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    paymentRef: { type: String, default: "" },
  },
  { timestamps: true },
);

bookDemoEnrollmentSchema.index({ razorpayOrderId: 1 }, { sparse: true });

export type BookDemoEnrollmentDoc = mongoose.InferSchemaType<typeof bookDemoEnrollmentSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const BookDemoEnrollment = mongoose.model("BookDemoEnrollment", bookDemoEnrollmentSchema);
