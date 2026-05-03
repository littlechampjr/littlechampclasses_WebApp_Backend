import cors from "cors";
import express from "express";
import { connectDb } from "./db.js";
import { helmet, rateLimit } from "./compat/vendorMiddleware.js";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { bookDemoRouter } from "./routes/bookDemo.js";
import { bookingsRouter } from "./routes/bookings.js";
import { coursesRouter } from "./routes/courses.js";
import { interestRouter } from "./routes/interest.js";
import { learnerMeRouter } from "./routes/learnerMe.js";
import { razorpayWebhookHandler } from "./routes/razorpayWebhook.js";
import { usersRouter } from "./routes/users.js";
import { testsRouter } from "./routes/tests.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const corsOrigins: string | string[] =
  env.frontendOrigins.length === 1
    ? env.frontendOrigins[0]!
    : env.frontendOrigins;

const corsAllowed = new Set(env.frontendOrigins);

/** Ensures error/404 JSON still gets CORS headers when Origin is allowed (avoids misleading browser CORS errors on 5xx). */
function applyCorsIfAllowed(
  req: express.Request,
  res: express.Response,
): void {
  if (res.getHeader("Access-Control-Allow-Origin")) return;
  const origin = req.headers.origin;
  if (typeof origin === "string" && corsAllowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhookHandler,
);

app.use(express.json({ limit: "64kb" }));

/** No Mongo — survives DB misconfig so you can confirm the deployment is live. */
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "littlechampclasses-backend",
    api: "/api/health",
    courses: "/api/courses",
    tests: "/api/tests",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "littlechampclasses-backend", db: "mongodb" });
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const interestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.use(globalLimiter);

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/me", learnerMeRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/bookings", bookingLimiter, bookingsRouter);
app.use("/api/book-demo", otpLimiter, bookDemoRouter);
app.use("/api/interest", interestLimiter, interestRouter);
app.use("/api/tests", testsRouter);

app.use((req, res) => {
  applyCorsIfAllowed(req, res);
  res.status(404).json({ error: "Not found" });
});

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    applyCorsIfAllowed(req, res);
    res.status(500).json({ error: "Internal server error" });
  },
);

if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

export default app;
