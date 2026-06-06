import { Router } from "express";
import { Teacher } from "../models/Teacher.js";
import { asyncHandler } from "../util/asyncHandler.js";

export const teachersRouter = Router();

teachersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await Teacher.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    res.json({
      teachers: rows.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        imageUrl: t.imageUrl ?? "",
        bioLine: t.bioLine ?? "",
        modalTagline: t.modalTagline ?? "",
        highlights: t.highlights ?? [],
      })),
    });
  }),
);
