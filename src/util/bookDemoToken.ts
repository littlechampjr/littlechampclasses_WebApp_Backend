import jwt from "jsonwebtoken";
import { env } from "../env.js";

const BOOK_DEMO_TYP = "book_demo";

export function signBookDemoToken(enrollmentId: string, phoneE164: string): string {
  return jwt.sign(
    { typ: BOOK_DEMO_TYP, phone: phoneE164 },
    env.jwtSecret,
    { subject: enrollmentId, expiresIn: "45m" },
  );
}

export function verifyBookDemoToken(
  token: string,
): { enrollmentId: string; phoneE164: string } | null {
  try {
    const p = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (p.typ !== BOOK_DEMO_TYP || typeof p.sub !== "string" || typeof p.phone !== "string") {
      return null;
    }
    return { enrollmentId: p.sub, phoneE164: p.phone };
  } catch {
    return null;
  }
}
