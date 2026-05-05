/**
 * Upserts one premium CBSE Master course with purchaseFlow + batch.
 * Caller must establish Mongoose connection first (see seed.ts).
 */
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { buildDetailDescription } from "./seedData.js";

export const MASTER_PROGRAM_SLUG = "master-program-cbse-7-8-26-27";

export async function upsertPremiumMasterCourse(): Promise<void> {
  const startsAt = new Date("2026-03-23T00:00:00.000Z");
  const endsAt = new Date("2027-03-31T23:59:59.999Z");

  const doc = await Course.findOneAndUpdate(
    { slug: MASTER_PROGRAM_SLUG },
    {
      title: "Master Program CBSE Class (7+8) 26-27",
      slug: MASTER_PROGRAM_SLUG,
      marketingTitle: "Master Course",
      description:
        "Premium full-year CBSE-aligned program — live classes, doubt support, and structured progress.",
      detailDescription: buildDetailDescription(
        "Master CBSE program for grades 7–8: structured academic year pacing, mentor support, recordings, assessments, and parent touchpoints.",
      ),
      track: "after-school",
      liveSessionsFirst: 450,
      liveSessionsSecond: 0,
      pricePaise: 3_199_900,
      compareAtPricePaise: 4_999_900,
      bookDemoEnabled: false,
      isDemo: false,
      isActive: true,
      previewVideoUrl: "",
      thumbnailUrl: "/courses/thumb-master.png",
      marketingBullets: [
        "Mathematics, Science, English & Social Studies",
        "Live classes · recordings · homework support",
        "Hinglish & English modes",
        "Weekly report cards · regular PTMs",
      ],
      classStartsAt: startsAt,
      purchaseFlow: {
        enabled: true,
        bannerEyebrow: "Join Master Course",
        bannerSubtitle: "Elevate Your Learning with Our Premium Program",
        previewCardProgramLine: "MASTER PROGRAM",
        previewCardBadge: "SCHOOL CURRICULUM",
        dateLabel: "Date",
        dateRangeDisplay: "",
        subjectsLabel: "Subjects",
        subjects: ["Mathematics", "Science", "English", "Social Studies"],
        shortTagline: "Free AI coding add-on",
        emiAvailableCopy: "EMI available",
        scheduleHeading: "Class schedule",
        scheduleBullets: [
          "450+ Live classes for the academic year",
          "7 – 8 PM (Mon – Sat)",
          "Mode of teaching: Hinglish (Hindi+English) and English",
        ],
        featureCards: [
          { iconEmoji: "💻", title: "450+ Live Classes", description: "Structured academic-year coverage with expert mentors." },
          { iconEmoji: "📅", title: "Academic year 2026–27", description: "Calendar-aligned pacing with revision windows." },
          { iconEmoji: "🎓", title: "Expert faculty + mentor", description: "Subject teachers plus a dedicated success mentor." },
          { iconEmoji: "⭐", title: "Tests & video library", description: "Chapter-wise tests and on-demand revision clips." },
          { iconEmoji: "📝", title: "Homework & doubt support", description: "Guided practice with 1:1 doubt slots." },
          { iconEmoji: "📊", title: "PTM & weekly report", description: "Transparent progress updates for parents." },
        ],
        detailSections: [
          {
            emoji: "📚",
            title: "Subjects & Curriculum",
            bullets: [
              "Maths, Science, SST & English",
              "Separate batches for CBSE, ICSE & J&K boards",
            ],
          },
          {
            emoji: "👑",
            title: "Doubt Solving & Support",
            bullets: ["1:1 teacher support for doubts & homework", "Extra help for school exams"],
          },
          {
            emoji: "👥",
            title: "Progress Tracking",
            bullets: ["Regular PTMs to check progress", "Weekly Report cards"],
          },
          {
            emoji: "✍️",
            title: "Course material & Practice",
            bullets: [
              "Recordings of all classes with notes",
              "Daily practice sheets and homework",
              "Chapter wise test series",
            ],
          },
          {
            emoji: "🏆",
            title: "Extra Learning Edge",
            bullets: [
              "Olympiad & other exam preparation",
              "Fun practical-based learning",
              "Coding, AI & other Micro courses included",
            ],
          },
        ],
        limitedOffers: [
          { label: "AI coding micro course", crossedPricePaise: 500_000, giftLabel: "Free" },
          { label: "Animated video library", crossedPricePaise: 300_000, giftLabel: "Free" },
        ],
        coupons: [
          {
            code: "WELCOME500",
            label: "Flat ₹500 off your first full program purchase",
            discountPaise: 50_000,
            discountPercent: null,
            active: true,
          },
        ],
      },
    },
    { upsert: true, new: true },
  );

  if (!doc) return;

  await CourseBatch.findOneAndUpdate(
    { course: doc._id, code: "MP26" },
    {
      course: doc._id,
      code: "MP26",
      startsAt,
      endsAt,
      isActive: true,
      sortOrder: 0,
    },
    { upsert: true, new: true },
  );

  console.log("[seed] Premium purchase course:", MASTER_PROGRAM_SLUG, "+ batch MP26");
}
