import { User } from "../models/User.js";

/**
 * Legacy unique index `email_1` from email/password auth. Phone-only users omit
 * `email`, so MongoDB stores them as one `null` per unique `email_1` — only one
 * new user can be inserted. Drop the stale index; safe to run every connect.
 */
export async function ensurePhoneOnlyUserIndexes(): Promise<void> {
  try {
    await User.collection.dropIndex("email_1");
    // eslint-disable-next-line no-console
    console.info("[db] Dropped legacy users index email_1 (phone-only auth).");
  } catch (err) {
    const e = err as { codeName?: string; code?: number };
    if (e.codeName === "IndexNotFound" || e.code === 27) return;
    // eslint-disable-next-line no-console
    console.warn("[db] ensurePhoneOnlyUserIndexes:", err);
  }
}
