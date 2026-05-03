import mongoose, { Schema } from "mongoose";

const interestedUserSchema = new Schema(
  {
    /** E.164 or normalized 10-digit national — stored as returned by phone util */
    phone: { type: String, required: true, trim: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    courseSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    /** Best-effort client IP (from trusted proxy) */
    ip: { type: String, default: "" },
  },
  { timestamps: true },
);

interestedUserSchema.index(
  { phone: 1, course: 1 },
  { unique: true, name: "interested_user_phone_per_course" },
);

export type InterestedUserDoc = mongoose.InferSchemaType<typeof interestedUserSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const InterestedUser = mongoose.model(
  "InterestedUser",
  interestedUserSchema,
  "interestedUsers",
);
