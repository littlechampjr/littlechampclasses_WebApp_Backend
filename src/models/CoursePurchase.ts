import mongoose, { Schema } from "mongoose";

const STATUS = ["pending", "paid", "failed"] as const;

const coursePurchaseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "CourseBatch", required: true, index: true },
    listPricePaise: { type: Number, required: true },
    strikePricePaise: { type: Number, default: null },
    baseSalePaise: { type: Number, required: true },
    userAdjustmentPaise: { type: Number, required: true, default: 0 },
    couponCode: { type: String, default: null, trim: true, uppercase: true },
    couponDiscountPaise: { type: Number, required: true, default: 0 },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR", trim: true },
    status: {
      type: String,
      enum: STATUS,
      default: "pending",
      index: true,
    },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
  },
  { timestamps: true },
);

export type CoursePurchaseDoc = mongoose.InferSchemaType<typeof coursePurchaseSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CoursePurchase = mongoose.model("CoursePurchase", coursePurchaseSchema);
