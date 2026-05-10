/**
 * One-time bootstrap: create super-admin from env.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_PASSWORD='secure' npx tsx src/scripts/createAdmin.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../env.js";
import { Admin } from "../models/Admin.js";

async function main(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!email || !password || password.length < 8) {
    throw new Error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD (min 8 chars)");
  }

  await mongoose.connect(env.mongoUri);
  const existing = await Admin.findOne({ email }).lean();
  if (existing) {
    console.error("Admin with this email already exists.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Admin.create({
    email,
    passwordHash,
    role: "admin",
    permissions: [],
    isActive: true,
  });

  console.log("Created admin:", email);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
