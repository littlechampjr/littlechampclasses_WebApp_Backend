import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    phoneE164: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    childName: { type: String, default: "", trim: true, maxlength: 120 },
    learningGoal: { type: String, default: "School Curriculum", trim: true, maxlength: 120 },
    /** Set on profile completion; 1–8 validated in API. */
    childGrade: { type: Number, default: null },
    profileComplete: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type UserDoc = mongoose.InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export const User = mongoose.model("User", userSchema);
