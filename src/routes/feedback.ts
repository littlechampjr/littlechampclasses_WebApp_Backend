import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { attachOptionalUser } from "../middleware/auth.js";
import { Feedback } from "../models/Feedback.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { normalizeIndianMobile } from "../util/phone.js";

export const feedbackRouter = Router();

function clientIp(req: import("express").Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  if (Array.isArray(xff) && xff[0]) {
    return xff[0]!.split(",")[0]!.trim();
  }
  return req.ip || "";
}

const submitSchema = z.object({
  name: z.string().min(1).max(200),
  mobileNumber: z.string().min(8).max(20),
  email: z.string().email().max(200).optional().or(z.literal("")),
  featureSuggestions: z.string().max(2000).optional(),
  improvementSuggestions: z.string().max(2000).optional(),
  activitiesSuggestions: z.string().max(2000).optional(),
  academicYearProgramSuggestions: z.string().max(2000).optional(),
  additionalFeedback: z.string().max(2000).optional(),
  rating: z.number().int().min(1).max(5),
});

feedbackRouter.post(
  "/",
  attachOptionalUser,
  asyncHandler(async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const phone = normalizeIndianMobile(parsed.data.mobileNumber);
    if (!phone.ok) {
      res.status(400).json({ error: phone.error });
      return;
    }

    const userId =
      req.userId && mongoose.isValidObjectId(req.userId)
        ? new mongoose.Types.ObjectId(req.userId)
        : null;

    const doc = await Feedback.create({
      user: userId,
      name: parsed.data.name.trim(),
      mobileNumber: phone.national10,
      email: (parsed.data.email ?? "").trim(),
      featureSuggestions: (parsed.data.featureSuggestions ?? "").trim(),
      improvementSuggestions: (parsed.data.improvementSuggestions ?? "").trim(),
      activitiesSuggestions: (parsed.data.activitiesSuggestions ?? "").trim(),
      academicYearProgramSuggestions: (parsed.data.academicYearProgramSuggestions ?? "").trim(),
      additionalFeedback: (parsed.data.additionalFeedback ?? "").trim(),
      rating: parsed.data.rating,
      ipAddress: clientIp(req),
      userAgent: (req.headers["user-agent"] || "").toString().slice(0, 500),
    });

    res.status(201).json({
      ok: true,
      id: doc._id.toString(),
      message: "Thank you! Your feedback has been recorded.",
    });
  }),
);
