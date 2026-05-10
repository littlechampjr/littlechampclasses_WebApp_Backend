import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function signUserAuthJwt(userId: string, phoneE164: string): string {
  return jwt.sign({ sub: userId, phone: phoneE164 }, env.jwtSecret, { expiresIn: "14d" });
}
