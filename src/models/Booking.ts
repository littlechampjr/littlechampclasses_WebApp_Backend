import mongoose, { Schema } from "mongoose";

const bookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, default: "confirmed" },
    paymentRef: { type: String, default: "mock_inr_5" },
    scheduledAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export type BookingDoc = mongoose.InferSchemaType<typeof bookingSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Booking = mongoose.model("Booking", bookingSchema);
