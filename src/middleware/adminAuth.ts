import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { AdminJwtPayload } from "../constants/adminPermissions.js";
import { env } from "../env.js";
import { Admin } from "../models/Admin.js";

function adminHasPermission(
  role: "admin" | "sub_admin",
  permissions: string[] | undefined,
  key: string,
): boolean {
  if (role === "admin") return true;
  const p = permissions ?? [];
  return p.includes("*") || p.includes(key);
}

export function requirePermission(key: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const a = req.admin;
    if (!a) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!adminHasPermission(a.role, a.permissions, key)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Attach `req.admin` from Bearer admin JWT. */
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.adminJwtSecret) as AdminJwtPayload;
    if (decoded.typ !== "admin" || !decoded.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const admin = await Admin.findById(decoded.sub).lean();
    if (!admin || admin.isActive === false) {
      res.status(401).json({ error: "Admin inactive or not found" });
      return;
    }

    req.admin = {
      id: admin._id.toString(),
      email: admin.email,
      role: admin.role as "admin" | "sub_admin",
      permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
