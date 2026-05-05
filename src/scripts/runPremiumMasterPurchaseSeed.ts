/**
 * Standalone: connects to MongoDB, upserts premium Master course + batch, then exits.
 * Run from backend root: npm run seed:premium
 * Requires MONGODB_URI in .env (or environment).
 */
import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../env.js";
import { MASTER_PROGRAM_SLUG, upsertPremiumMasterCourse } from "./premiumMasterPurchaseSeed.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  await upsertPremiumMasterCourse();
  await mongoose.disconnect();
  console.log("[seed:premium] Finished. Slug:", MASTER_PROGRAM_SLUG);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
