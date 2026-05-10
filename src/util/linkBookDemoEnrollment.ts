import type mongoose from "mongoose";
import { Enrollment } from "../models/Enrollment.js";
import { User, type UserDoc } from "../models/User.js";

/**
 * After a book-demo payment is marked paid, ensure a User exists for the phone
 * and an active Enrollment row for the batch (same logic as client verify-payment).
 */
export async function linkPaidBookDemoToUserEnrollment(
  phoneE164: string,
  batchId: mongoose.Types.ObjectId | null | undefined,
  bookDemoEnrollmentId: mongoose.Types.ObjectId,
): Promise<{ user: UserDoc }> {
  let user = await User.findOne({ phoneE164 });
  if (!user) {
    user = await User.create({
      phoneE164,
      childName: "",
      learningGoal: "School Curriculum",
      profileComplete: false,
    });
  }

  if (batchId) {
    await Enrollment.updateOne(
      { user: user._id, batch: batchId },
      {
        $setOnInsert: {
          user: user._id,
          batch: batchId,
          status: "active",
          source: "book_demo",
          purchasedAt: new Date(),
          bookDemoEnrollment: bookDemoEnrollmentId,
        },
      },
      { upsert: true },
    );
  }

  return { user };
}
