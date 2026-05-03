import "dotenv/config";
import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import mongoose from "mongoose";
import { env } from "../env.js";
import { ClassSession } from "../models/ClassSession.js";
import { Course } from "../models/Course.js";
import { CourseBatch } from "../models/CourseBatch.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import {
  todayYmd,
  weekRangeUtcFromMondayContaining,
  ymdInTz,
} from "../util/scheduleTime.js";
import { buildDetailDescription } from "./seedData.js";

const T = {
  stories: "/courses/thumb-stories.svg",
  english: "/courses/thumb-english.webp",
  maths: "/courses/thumb-maths.svg",
  activity: "/courses/thumb-activity.svg",
  science: "/courses/thumb-science.svg",
  phonics: "/courses/thumb-phonics.svg",
  logic: "/courses/thumb-logic.svg",
  creative: "/courses/thumb-creative.svg",
} as const;

const V = {
  a: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  b: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  c: "https://www.youtube.com/watch?v=668nUCeBHyY",
} as const;

const LIVE_A = 6;
const LIVE_B = 6;
const PRICE = 500;
const BOOK_DEMO_FEATURED = new Set([
  "after-school-spark-demo",
  "learn-english-demo",
  "learn-maths-demo",
]);
/** Demo UI: ₹9 current, ₹199 strikethrough (paise). */
const BOOK_DEMO_PRICE_PAISE = 900;
const BOOK_DEMO_COMPARE_PAISE = 19900;

const demos = [
  {
    title: "After-School Spark (Demo)",
    slug: "after-school-spark-demo",
    marketingTitle: "After-School",
    marketingBullets: [
      "Ages: Early years · Grades 1–2 style bands (1–8 overall)",
      "Duration: ₹5 demo · then 6 + 6 live classes (12 sessions)",
      "Focus: English, Maths, discovery stories, gentle revision",
      "Alignment: CBSE / ICSE friendly pacing for young learners",
    ],
    description:
      "Fuel your child’s growth after school—confidence, routines, and joyful revision with IIT mentors.",
    detailDescription: buildDetailDescription(
      "After-school track: energy release, listening games, and light revision so kids arrive calm and curious. Block A builds group habits; Block B adds short challenges that feel like play.",
    ),
    track: "after-school" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.a,
    thumbnailUrl: T.stories,
    classStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Learn English: Sounds & Stories (Demo)",
    slug: "learn-english-demo",
    marketingTitle: "Learn English",
    marketingBullets: [
      "Ages: 4–8 · phonics, stories, speaking confidence",
      "Duration: ₹5 demo · full path 12 live classes (6+6)",
      "Class size: 4–6 learners per batch",
      "Path: Early literacy · aligned with common international scales (CEFR-style goals)",
    ],
    description:
      "Help your child master English skills—phonics, vocabulary, and joyful read-alouds.",
    detailDescription: buildDetailDescription(
      "English track: letter sounds, blending, sight words, and short speaking turns. Block A focuses on hearing and repeating; Block B adds short stories and simple writing aloud.",
    ),
    track: "english" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.c,
    thumbnailUrl: T.english,
    classStartsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Learn Maths: Patterns & Play (Demo)",
    slug: "learn-maths-demo",
    marketingTitle: "Maths Learning",
    marketingBullets: [
      "Ages: 4–8 · visual & mental maths habits",
      "Duration: ₹5 demo · structured 6 + 6 live program",
      "Class size: Up to 10 in select batches",
      "Focus: Patterns, word problems, faster mental calculations",
    ],
    description:
      "Unlock math confidence—solve problems with drawings, stories, and smart shortcuts.",
    detailDescription: buildDetailDescription(
      "Maths track: counting, comparing, shapes, and word problems with drawings. Block A uses manipulatives and movement; Block B introduces slightly longer problems and explaining your thinking.",
    ),
    track: "maths" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.b,
    thumbnailUrl: T.maths,
    classStartsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Activity Kits: Build & Explore (Demo)",
    slug: "activity-kits-demo",
    description:
      "Hands-on builds with simple materials—₹5 demo; 12 live workshops (6+6) when you continue after the trial.",
    detailDescription: buildDetailDescription(
      "Activity track: cutting, folding, stacking, and simple science crafts using home-safe supplies. Block A is guided builds; Block B is “design your own” with constraints so creativity stays focused.",
    ),
    track: "activity" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.c,
    thumbnailUrl: T.activity,
    classStartsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Tiny Scientists: Ask Why (Demo)",
    slug: "tiny-scientists-demo",
    description:
      "Mini experiments and “why” questions—₹5 demo; full course runs 6+6 live sessions for curious 5–8 year olds.",
    detailDescription: buildDetailDescription(
      "Science curiosity: observation, guessing, testing with safe household items, and naming what happened. Block A is teacher-led demos; Block B lets kids predict before each mini experiment.",
    ),
    track: "after-school" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.a,
    thumbnailUrl: T.science,
    classStartsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Rhyme & Chime: English Demo",
    slug: "rhyme-chime-english-demo",
    description:
      "Rhymes, rhythm, and speaking confidence—₹5 to book the demo; 12 live classes (6+6) in the paid program later.",
    detailDescription: buildDetailDescription(
      "Rhyme track: songs, clap patterns, tongue twisters, and short performances. Block A builds ear for sounds; Block B adds partner dialogues and tiny “stage” moments.",
    ),
    track: "english" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.a,
    thumbnailUrl: T.phonics,
    classStartsAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Number Ninjas: Problem Solving (Demo)",
    slug: "number-ninjas-demo",
    description:
      "Visual word problems and mental maths—₹5 demo seat; continue with 6 live + 6 live structured classes.",
    detailDescription: buildDetailDescription(
      "Problem-solving track: drawing the story, choosing an operation, and checking with a second strategy. Block A is single-step contexts; Block B adds two-step stories and peer explanations.",
    ),
    track: "maths" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.c,
    thumbnailUrl: T.logic,
    classStartsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  },
  {
    title: "Art & Story Lab (Demo)",
    slug: "art-story-lab-demo",
    description:
      "Draw-along plus one-sentence stories—₹5 demo; full journey is twelve live sessions split 6+6.",
    detailDescription: buildDetailDescription(
      "Art + literacy: simple shapes, characters, and turning drawings into captions. Block A is copy-the-mentor; Block B is independent panels with feedback rounds.",
    ),
    track: "activity" as const,
    liveSessionsFirst: LIVE_A,
    liveSessionsSecond: LIVE_B,
    pricePaise: PRICE,
    previewVideoUrl: V.b,
    thumbnailUrl: T.creative,
    classStartsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  },
];

const QA_PHONE_E164 = "+919876543210";

/**
 * QA user + enrollment + class sessions for the current ISO week (Asia/Kolkata) on Learn English batch A.
 */
async function seedDashboardQaData() {
  const tz = env.scheduleTz;
  const course = await Course.findOne({ slug: "learn-english-demo" }).lean();
  if (!course) return;

  const batch = await CourseBatch.findOne({ course: course._id, code: "A" });
  if (!batch) return;

  const weekStart = addDays(new Date(), -14);
  const weekEnd = addDays(new Date(), 60);
  batch.startsAt = weekStart;
  batch.endsAt = weekEnd;
  await batch.save();

  await User.findOneAndUpdate(
    { phoneE164: QA_PHONE_E164 },
    {
      $setOnInsert: {
        phoneE164: QA_PHONE_E164,
        childName: "QA Learner",
        learningGoal: "School Curriculum",
        childGrade: 2,
        profileComplete: true,
      },
    },
    { upsert: true },
  );

  const user = await User.findOne({ phoneE164: QA_PHONE_E164 }).lean();
  if (!user) return;

  await Enrollment.findOneAndUpdate(
    { user: user._id, batch: batch._id },
    {
      $set: {
        status: "active",
        source: "admin",
        purchasedAt: new Date(),
      },
      $setOnInsert: {
        user: user._id,
        batch: batch._id,
      },
    },
    { upsert: true },
  );

  await ClassSession.deleteMany({ batch: batch._id });

  const ymdToday = todayYmd(tz);
  const { weekStartUtc } = weekRangeUtcFromMondayContaining(ymdToday, tz);

  function startsAtEvening(ymd: string, hour: number, minute: number): Date {
    const [y, m, d] = ymd.split("-").map(Number);
    return fromZonedTime(new Date(y, m - 1, d, hour, minute, 0, 0), tz);
  }

  let cursor = weekStartUtc;
  const titles = [
    "Sounds & rhythm warm-up",
    "Story circle: brave mice",
    "Phonics: blends practice",
    "Show & tell rehearsal",
    "Reading aloud together",
    "Word games & movement",
    "Weekly wrap & badges",
  ];
  const subjects = ["English", "English", "English", "English", "English", "English", "English"];

  const docs = [];
  for (let i = 0; i < 7; i += 1) {
    const ymd = ymdInTz(cursor, tz);
    docs.push({
      batch: batch._id,
      startsAt: startsAtEvening(ymd, 20, 0),
      durationMinutes: i === 2 ? 97 : 60,
      subject: subjects[i] ?? "English",
      title: titles[i] ?? `Live class ${i + 1}`,
      teacherName: "Mentor Priya",
      teacherImageUrl: "",
      statusMicrocopy: "Stay tuned! Class details will be added soon.",
      hasAttachments: i % 3 === 0,
      sortOrder: i,
    });
    cursor = addDays(cursor, 1);
  }

  await ClassSession.insertMany(docs);
  console.log(
    "[seed] Dashboard QA: user",
    QA_PHONE_E164,
    "enrolled in learn-english-demo batch A; class sessions for week of",
    ymdToday,
  );
}

async function run() {
  await mongoose.connect(env.mongoUri);
  for (const d of demos) {
    const featured = BOOK_DEMO_FEATURED.has(d.slug);
    const pricePaise = featured ? BOOK_DEMO_PRICE_PAISE : d.pricePaise;
    await Course.findOneAndUpdate(
      { slug: d.slug },
      {
        ...d,
        pricePaise,
        compareAtPricePaise: featured ? BOOK_DEMO_COMPARE_PAISE : null,
        bookDemoEnabled: featured,
        isDemo: true,
        isActive: true,
      },
      { upsert: true, new: true },
    );
  }

  const windows: { code: "A" | "B" | "C"; start: string; end: string }[] = [
    { code: "A", start: "2026-04-27T00:00:00.000Z", end: "2026-05-03T23:59:59.999Z" },
    { code: "B", start: "2026-05-04T00:00:00.000Z", end: "2026-05-10T23:59:59.999Z" },
    { code: "C", start: "2026-05-11T00:00:00.000Z", end: "2026-05-17T23:59:59.999Z" },
  ];

  for (const slug of BOOK_DEMO_FEATURED) {
    const course = await Course.findOne({ slug }).lean();
    if (!course) continue;
    for (const [idx, w] of windows.entries()) {
      await CourseBatch.findOneAndUpdate(
        { course: course._id, code: w.code },
        {
          course: course._id,
          code: w.code,
          startsAt: new Date(w.start),
          endsAt: new Date(w.end),
          isActive: true,
          sortOrder: idx,
        },
        { upsert: true, new: true },
      );
    }
  }

  await seedDashboardQaData();

  console.log("Seeded demo courses:", demos.length, "→", demos.map((x) => x.slug).join(", "));
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
