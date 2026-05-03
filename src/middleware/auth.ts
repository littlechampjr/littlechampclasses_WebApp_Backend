import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

type JwtBody = { sub?: string };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtBody;
    if (!decoded.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
