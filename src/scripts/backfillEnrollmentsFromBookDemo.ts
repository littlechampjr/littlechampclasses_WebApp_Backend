import "dotenv/config";
import mongoose from "mongoose";
import { BookDemoEnrollment } from "../models/BookDemoEnrollment.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import { env } from "../env.js";

/**
 * Idempotent: creates Enrollment for each paid BookDemoEnrollment where a User exists with the same phone.
 */
async function run() {
  await mongoose.connect(env.mongoUri);
  const paid = await BookDemoEnrollment.find({ status: "paid" }).lean();
  let created = 0;
  let skipped = 0;

  for (const row of paid) {
    const user = await User.findOne({ phoneE164: row.phoneE164 }).lean();
    if (!user) {
      skipped += 1;
      continue;
    }

    const purchasedAt =
      row.updatedAt && !Number.isNaN(new Date(row.updatedAt).getTime())
        ? new Date(row.updatedAt)
        : new Date();

    const res = await Enrollment.updateOne(
      { user: user._id, batch: row.batch },
      {
        $set: {
          status: "active",
          source: "book_demo",
          bookDemoEnrollment: row._id,
        },
        $setOnInsert: {
          user: user._id,
          batch: row.batch,
          purchasedAt,
        },
      },
      { upsert: true },
    );

    if (res.upsertedCount > 0) created += 1;
  }

  console.log(
    `[backfill enrollments] paid rows=${paid.length} upsertedNew=${created} skippedNoUser=${skipped}`,
  );
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
