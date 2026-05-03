import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { Booking } from "../models/Booking.js";
import { Course } from "../models/Course.js";

const createSchema = z.object({
  courseId: z.string().min(1),
  scheduledAt: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const bookingsRouter = Router();

function toDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function serializePopulatedBooking(b: Record<string, unknown>) {
  const courseRaw = b.course;
  let courseOut: {
    id: string;
    title: string;
    slug: string;
    previewVideoUrl: string;
    thumbnailUrl: string;
    liveSessionsFirst: number;
    liveSessionsSecond: number;
    totalLiveSessions: number;
    classStartsAt: Date | null;
  } | null = null;

  if (courseRaw && typeof courseRaw === "object" && courseRaw !== null && "_id" in courseRaw) {
    const c = courseRaw as Record<string, unknown>;
    const first = Number(c.liveSessionsFirst ?? 6);
    const second = Number(c.liveSessionsSecond ?? 6);
    courseOut = {
      id: String(c._id),
      title: String(c.title ?? ""),
      slug: String(c.slug ?? ""),
      previewVideoUrl: String(c.previewVideoUrl ?? ""),
      thumbnailUrl: String(c.thumbnailUrl ?? ""),
      liveSessionsFirst: first,
      liveSessionsSecond: second,
      totalLiveSessions: first + second,
      classStartsAt: toDate(c.classStartsAt),
    };
  }

  return {
    id: String(b._id),
    amountPaise: Number(b.amountPaise),
    amountRupees: Number(b.amountPaise) / 100,
    currency: String(b.currency ?? "INR"),
    status: String(b.status ?? ""),
    paymentRef: String(b.paymentRef ?? ""),
    scheduledAt: toDate(b.scheduledAt),
    notes: String(b.notes ?? ""),
    createdAt: toDate(b.createdAt),
    course: courseOut,
  };
}

bookingsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const course = await Course.findOne({
    _id: parsed.data.courseId,
    isActive: true,
  });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  let scheduledAt: Date | null = null;
  const raw = parsed.data.scheduledAt?.trim();
  if (raw) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid scheduledAt" });
      return;
    }
    scheduledAt = d;
  }

  const booking = await Booking.create({
    user: req.userId,
    course: course._id,
    amountPaise: course.pricePaise,
    currency: "INR",
    status: "confirmed",
    paymentRef: "demo_booking_no_gateway_inr_5",
    scheduledAt,
    notes: parsed.data.notes ?? "",
  });

  const populated = await Booking.findById(booking._id).populate("course").lean();
  if (!populated) {
    res.status(500).json({ error: "Booking create failed" });
    return;
  }
  res.status(201).json({ booking: serializePopulatedBooking(populated as Record<string, unknown>) });
  }),
);

bookingsRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
  const list = await Booking.find({ user: req.userId })
    .populate("course")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    bookings: list.map((b) => serializePopulatedBooking(b as Record<string, unknown>)),
  });
  }),
);
