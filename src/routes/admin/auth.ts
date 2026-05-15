import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { rateLimit } from "../../compat/vendorMiddleware.js";
import { ADMIN_PERMISSIONS, type AdminJwtPayload } from "../../constants/adminPermissions.js";
import { env } from "../../env.js";
import { Admin } from "../../models/Admin.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminAuthRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const loginBody = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
});

adminAuthRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const admin = await Admin.findOne({ email }).lean();
    if (!admin || admin.isActive === false) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const ok = await bcrypt.compare(parsed.data.password, admin.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const payload: AdminJwtPayload = {
      sub: admin._id.toString(),
      typ: "admin",
      role: admin.role as "admin" | "sub_admin",
      email: admin.email,
    };

    const token = jwt.sign(payload, env.adminJwtSecret, { expiresIn: "8h" });

    res.json({
      token,
      admin: {
        id: admin._id.toString(),
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions ?? [],
      },
    });
  }),
);

/** Useful for sub_admin UI — requires metrics permission conceptually but harmless metadata. */
adminAuthRouter.get(
  "/permissions-catalog",
  (_req, res) => {
    res.json({ permissions: ADMIN_PERMISSIONS });
  },
);
