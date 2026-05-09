/**
 * Upserts one premium CBSE Master course with purchaseFlow + batch.
 * Caller must establish Mongoose connection first (see seed.ts).
 */
import mongoose from "mongoose";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { CourseStudyOutline } from "../models/CourseStudyOutline.js";
import { CourseTeacher } from "../models/CourseTeacher.js";
import { ProgramFaq } from "../models/ProgramFaq.js";
import { Teacher } from "../models/Teacher.js";
import { Test } from "../models/Test.js";
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

  await upsertPremiumMasterLearningArtifacts(doc._id);
}

/** Teachers, FAQs, study outline, and program-scoped tests for the master course. */
async function upsertPremiumMasterLearningArtifacts(courseId: mongoose.Types.ObjectId) {
  const tMath = await Teacher.findOneAndUpdate(
    { name: "Shubham Rai" },
    {
      name: "Shubham Rai",
      imageUrl: "",
      bioLine: "Mathematics · IIT alumni",
      isActive: true,
    },
    { upsert: true, new: true },
  );
  const tSci = await Teacher.findOneAndUpdate(
    { name: "Ananya Mehta" },
    {
      name: "Ananya Mehta",
      imageUrl: "",
      bioLine: "Science · NSO mentor",
      isActive: true,
    },
    { upsert: true, new: true },
  );
  const tEng = await Teacher.findOneAndUpdate(
    { name: "Rohan Verma" },
    {
      name: "Rohan Verma",
      imageUrl: "",
      bioLine: "English · communication coach",
      isActive: true,
    },
    { upsert: true, new: true },
  );

  if (tMath) {
    await CourseTeacher.findOneAndUpdate(
      { course: courseId, teacher: tMath._id, subjectLabel: "Mathematics" },
      { course: courseId, teacher: tMath._id, subjectLabel: "Mathematics", sortOrder: 0 },
      { upsert: true, new: true },
    );
  }
  if (tSci) {
    await CourseTeacher.findOneAndUpdate(
      { course: courseId, teacher: tSci._id, subjectLabel: "Science" },
      { course: courseId, teacher: tSci._id, subjectLabel: "Science", sortOrder: 1 },
      { upsert: true, new: true },
    );
  }
  if (tEng) {
    await CourseTeacher.findOneAndUpdate(
      { course: courseId, teacher: tEng._id, subjectLabel: "English" },
      { course: courseId, teacher: tEng._id, subjectLabel: "English", sortOrder: 2 },
      { upsert: true, new: true },
    );
  }

  await ProgramFaq.findOneAndUpdate(
    { courseIds: courseId, question: "When does the master program start?" },
    {
      question: "When does the master program start?",
      answer:
        "Batch start dates are shown on your enrollment card. You’ll receive schedule and joining details on WhatsApp before the first class.",
      sortOrder: 0,
      isActive: true,
      courseIds: [courseId],
    },
    { upsert: true, new: true },
  );

  await ProgramFaq.findOneAndUpdate(
    { courseIds: courseId, question: "Where do I find the timetable and class links?" },
    {
      question: "Where do I find the timetable and class links?",
      answer:
        "Your batch schedule and joining links are shared on the WhatsApp group for enrolled families. You can also see upcoming sessions from your dashboard.",
      sortOrder: 1,
      isActive: true,
      courseIds: [courseId],
    },
    { upsert: true, new: true },
  );

  await ProgramFaq.findOneAndUpdate(
    { courseIds: courseId, question: "How do I access recordings and study material?" },
    {
      question: "How do I access recordings and study material?",
      answer:
        "Class recordings and notes are organized by subject in the Study Room tab after you enroll. Materials are added as each block progresses.",
      sortOrder: 2,
      isActive: true,
      courseIds: [courseId],
    },
    { upsert: true, new: true },
  );

  await CourseStudyOutline.findOneAndUpdate(
    { course: courseId },
    {
      course: courseId,
      subjects: [
        {
          key: "mathematics",
          label: "Mathematics",
          sortOrder: 0,
          chapters: [
            {
              title: "Block A — Number systems",
              videoCount: 3,
              exerciseCount: 0,
              noteCount: 3,
              sortOrder: 0,
            },
          ],
        },
        {
          key: "science",
          label: "Science",
          sortOrder: 1,
          chapters: [
            {
              title: "Block A — Motion & forces",
              videoCount: 2,
              exerciseCount: 0,
              noteCount: 2,
              sortOrder: 0,
            },
          ],
        },
        {
          key: "english",
          label: "English",
          sortOrder: 2,
          chapters: [
            {
              title: "Block A — Reading & inference",
              videoCount: 1,
              exerciseCount: 0,
              noteCount: 1,
              sortOrder: 0,
            },
          ],
        },
      ],
    },
    { upsert: true, new: true },
  );

  await Test.updateMany({ slug: "natural-disaster-practice" }, { $set: { courseIds: [courseId] } });
}
