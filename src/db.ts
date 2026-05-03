import mongoose from "mongoose";
import { env } from "./env.js";
import { ensurePhoneOnlyUserIndexes } from "./migrations/legacyUserIndexes.js";

/** Reuse connection across Vercel serverless invocations */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __mongooseCache?: MongooseCache;
};

const cache: MongooseCache =
  globalWithMongoose.__mongooseCache ?? { conn: null, promise: null };
if (!globalWithMongoose.__mongooseCache) {
  globalWithMongoose.__mongooseCache = cache;
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn?.connection?.readyState === 1) {
    return cache.conn;
  }
  if (!cache.promise) {
    cache.promise = mongoose.connect(env.mongoUri);
  }
  try {
    cache.conn = await cache.promise;
    await ensurePhoneOnlyUserIndexes();
    return cache.conn;
  } catch (err) {
    cache.promise = null;
    cache.conn = null;
    throw err;
  }
}
