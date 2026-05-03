import type { RequestHandler } from "express";
import { verifyBookDemoToken } from "../util/bookDemoToken.js";

export const requireBookDemoToken: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Missing session. Verify OTP again." });
    return;
  }
  const session = verifyBookDemoToken(token);
  if (!session) {
    res.status(401).json({ error: "Session expired. Verify OTP again." });
    return;
  }
  req.bookDemoSession = session;
  next();
};
