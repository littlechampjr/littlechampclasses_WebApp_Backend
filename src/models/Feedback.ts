import mongoose, { Schema } from "mongoose";

export const FEEDBACK_STATUS = ["new", "reviewed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[number];

const feedbackSchema = new Schema(
  {
    /** Set only when submitted while logged in. */
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    /** Stored as 10-digit national format (matches existing InterestedUser/User norm). */
    mobileNumber: { type: String, required: true, trim: true, maxlength: 20, index: true },
    email: { type: String, default: "", trim: true, maxlength: 200 },

    featureSuggestions: { type: String, default: "", maxlength: 2000 },
    improvementSuggestions: { type: String, default: "", maxlength: 2000 },
    activitiesSuggestions: { type: String, default: "", maxlength: 2000 },
    academicYearProgramSuggestions: { type: String, default: "", maxlength: 2000 },
    additionalFeedback: { type: String, default: "", maxlength: 2000 },

    rating: { type: Number, required: true, min: 1, max: 5 },

    status: {
      type: String,
      enum: FEEDBACK_STATUS,
      default: "new",
      index: true,
    },

    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

feedbackSchema.index({ createdAt: -1 });

export type FeedbackDoc = mongoose.InferSchemaType<typeof feedbackSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Feedback = mongoose.model("Feedback", feedbackSchema);
