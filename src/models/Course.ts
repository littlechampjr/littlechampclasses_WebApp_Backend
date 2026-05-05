import mongoose, { Schema } from "mongoose";

const purchaseCouponDefSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    discountPaise: { type: Number, default: null, min: 0 },
    discountPercent: { type: Number, default: null, min: 0, max: 100 },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const purchaseFlowSchema = new Schema(
  {
    /** When true, course appears in premium purchase banner & full checkout. */
    enabled: { type: Boolean, default: false },
    bannerEyebrow: { type: String, default: "", trim: true },
    bannerSubtitle: { type: String, default: "", trim: true },
    previewCardProgramLine: { type: String, default: "MASTER PROGRAM", trim: true },
    previewCardBadge: { type: String, default: "SCHOOL CURRICULUM", trim: true },
    dateLabel: { type: String, default: "Date", trim: true },
    /** Shown in banner & checkout when batches are empty or as override. */
    dateRangeDisplay: { type: String, default: "", trim: true },
    subjectsLabel: { type: String, default: "Subjects", trim: true },
    subjects: { type: [String], default: [] },
    shortTagline: { type: String, default: "", trim: true },
    emiAvailableCopy: { type: String, default: "EMI available", trim: true },
    featureCards: {
      type: [
        new Schema(
          {
            iconEmoji: { type: String, default: "✨", trim: true },
            title: { type: String, required: true, trim: true },
            description: { type: String, required: true, trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    scheduleBullets: { type: [String], default: [] },
    scheduleHeading: { type: String, default: "Class schedule", trim: true },
    detailSections: {
      type: [
        new Schema(
          {
            emoji: { type: String, default: "📚", trim: true },
            title: { type: String, required: true, trim: true },
            bullets: { type: [String], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    limitedOffers: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, trim: true },
            crossedPricePaise: { type: Number, default: null, min: 0 },
            giftLabel: { type: String, default: "Free", trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    coupons: { type: [purchaseCouponDefSchema], default: [] },
  },
  { _id: false },
);

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
    /** Premium purchase flow CMS (optional). */
    purchaseFlow: { type: purchaseFlowSchema, default: undefined },
  },
  { timestamps: true },
);

export type CourseDoc = mongoose.InferSchemaType<typeof courseSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Course = mongoose.model("Course", courseSchema);
