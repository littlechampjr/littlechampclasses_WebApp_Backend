import { Router } from "express";
import { adminAssignmentsRouter } from "./assignments.js";
import { adminAuthRouter } from "./auth.js";
import { adminCoursesRouter } from "./courses.js";
import { adminDashboardRouter } from "./dashboard.js";
import { adminFaqsRouter } from "./faqs.js";
import {
  adminBatchRootRouter,
  adminScheduleRouter,
  adminSessionsRouter,
} from "./schedule.js";
import { adminTeachersRouter } from "./teachers.js";
import { adminTestsRouter } from "./tests.js";
import { adminUploadsRouter } from "./uploads.js";

export const adminRouter = Router();

adminRouter.use("/auth", adminAuthRouter);
adminRouter.use(adminDashboardRouter);
adminRouter.use("/courses", adminCoursesRouter);
adminRouter.use("/courses/:courseId/batches", adminScheduleRouter);
adminRouter.use("/", adminBatchRootRouter);
adminRouter.use("/batches/:batchId/sessions", adminSessionsRouter);
adminRouter.use("/teachers", adminTeachersRouter);
adminRouter.use("/faqs", adminFaqsRouter);
adminRouter.use("/tests", adminTestsRouter);
adminRouter.use("/assignments", adminAssignmentsRouter);
adminRouter.use("/uploads", adminUploadsRouter);
