import type { Types } from "mongoose";
import { Course } from "../models/Course.js";
import { CourseStudyOutline } from "../models/CourseStudyOutline.js";

/**
 * Server-side checks before flipping course to published.
 * Does not persist — callers decide UX (toast vs hard block).
 */
export async function validateCourseForPublish(
  courseId: Types.ObjectId,
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const c = await Course.findById(courseId).lean();
  if (!c) {
    return { ok: false, errors: ["Course not found"] };
  }
  if (!String(c.title ?? "").trim()) errors.push("Title is required");
  if (!String(c.slug ?? "").trim()) errors.push("Slug is required");
  if (!String(c.description ?? "").trim()) errors.push("Description is required");
  if (typeof c.pricePaise !== "number" || !Number.isFinite(c.pricePaise) || c.pricePaise < 0) {
    errors.push("Valid price (paise) is required");
  }

  const outline = await CourseStudyOutline.findOne({ course: courseId }).lean();
  const subjects = outline?.subjects ?? [];
  if (subjects.length === 0) {
    errors.push("Study outline must have at least one subject");
  }

  return { ok: errors.length === 0, errors };
}
