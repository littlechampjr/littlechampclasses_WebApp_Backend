import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { rateLimit } from "../compat/vendorMiddleware.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { publicUserResponse } from "./auth.js";

export const usersRouter = Router();

const profileWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many profile updates. Please try again later." },
});

const patchProfileSchema = z.object({
  childName: z.string().min(1).max(120).trim(),
  learningGoal: z.string().min(1).max(120).trim(),
  childGrade: z.coerce.number().int().min(1).max(8),
});

usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).lean();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: publicUserResponse(user) });
  }),
);

usersRouter.patch(
  "/me",
  profileWriteLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = patchProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { childName, learningGoal, childGrade } = parsed.data;
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: {
          childName,
          learningGoal,
          childGrade,
          profileComplete: true,
        },
      },
      { new: true },
    ).lean();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user: publicUserResponse(user) });
  }),
);
