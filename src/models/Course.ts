import mongoose, { Schema } from "mongoose";

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Short card summary (one–two sentences). */
    description: { type: String, required: true },
    /** Full, valid program copy shown on the website (plain text, paragraphs separated by blank lines). */
    detailDescription: { type: String, required: true, default: "" },
    track: {
      type: String,
      required: true,
      enum: ["after-school", "english", "maths", "activity"],
    },
    /** First block of live classes (e.g. 6). */
    liveSessionsFirst: { type: Number, required: true, default: 6 },
    /** Second block of live classes (e.g. 6). */
    liveSessionsSecond: { type: Number, required: true, default: 6 },
    pricePaise: { type: Number, required: true, default: 500 },
    /** Optional “was” price for UI (paise). Omit or null when not on sale. */
    compareAtPricePaise: { type: Number, default: null },
    /** When true, homepage card opens Book Demo flow (modal). */
    bookDemoEnabled: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: true },
    previewVideoUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    /** Short headline for homepage cards (e.g. "After-School"). */
    marketingTitle: { type: String, default: "" },
    /** Up to four lines for program cards (grades, duration, batch size, curriculum). */
    marketingBullets: { type: [String], default: [] },
    classStartsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type CourseDoc = mongoose.InferSchemaType<typeof courseSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Course = mongoose.model("Course", courseSchema);
