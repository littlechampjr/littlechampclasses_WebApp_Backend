import mongoose, { Schema } from "mongoose";

export const OTP_PURPOSES = ["book_demo", "login", "signup", "interest"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const otpChallengeSchema = new Schema(
  {
    phoneE164: { type: String, required: true, index: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    purpose: { type: String, required: true, enum: OTP_PURPOSES },
    /** Extra context for book_demo (course slug, batch id, grade). */
    meta: { type: Schema.Types.Mixed, default: {} },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpChallengeDoc = mongoose.InferSchemaType<typeof otpChallengeSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OtpChallenge = mongoose.model("OtpChallenge", otpChallengeSchema);
