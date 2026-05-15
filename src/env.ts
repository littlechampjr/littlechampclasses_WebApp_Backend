import "dotenv/config";

const isDeployed =
  Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return trimmed;
}

const frontendRaw =
  [process.env.FRONTEND_URL, process.env.ADMIN_FRONTEND_URL].filter(Boolean).join(",") ||
  "http://localhost:3000,http://localhost:3001";

function normalizeOrigin(url: string): string {
  const t = url.trim();
  if (!t) return t;
  try {
    const withScheme = t.includes("://")
      ? t
      : t.startsWith("localhost") || t.startsWith("127.")
        ? `http://${t}`
        : `https://${t}`;
    return new URL(withScheme).origin;
  } catch {
    return t.replace(/\/$/, "");
  }
}

/** Adds the paired www / apex origin so FRONTEND_URL only needs one of them. */
function expandWwwApexVariants(origins: string[]): string[] {
  const out = new Set(origins);
  for (const o of origins) {
    try {
      const u = new URL(o);
      const host = u.hostname;
      if (host === "localhost" || host.startsWith("127.")) continue;
      const otherHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
      if (!otherHost || otherHost === host) continue;
      const mirrored = new URL(u.href);
      mirrored.hostname = otherHost;
      out.add(mirrored.origin);
    } catch {
      /* ignore invalid */
    }
  }
  return [...out];
}

export const env = {
  port: Number(process.env.PORT) || 4100,
  mongoUri: isDeployed
    ? requireEnv("MONGODB_URI", process.env.MONGODB_URI)
    : (process.env.MONGODB_URI ??
      "mongodb+srv://codeconnect123:codeconnect123@cluster0.ocxugzh.mongodb.net/littlechampjunior?retryWrites=true&w=majority"),
      // "mongodb://127.0.0.1:27017/littlechampclasses"),
  jwtSecret: isDeployed
    ? requireEnv("JWT_SECRET", process.env.JWT_SECRET)
    : (process.env.JWT_SECRET ?? "dev-only-change-me"),
  /** Separate secret so learner JWTs cannot be reused as admin tokens. */
  adminJwtSecret: isDeployed
    ? requireEnv("ADMIN_JWT_SECRET", process.env.ADMIN_JWT_SECRET)
    : (process.env.ADMIN_JWT_SECRET ?? "dev-admin-jwt-change-me"),
  /** Comma-separated origins for CORS (no trailing path). www ⇄ apex is expanded automatically. */
  frontendOrigins: (() => {
    const list = frontendRaw
      .split(",")
      .map((s) => normalizeOrigin(s))
      .filter(Boolean);
    const base = list.length > 0 ? list : ["http://localhost:3000"];
    return expandWwwApexVariants(base);
  })(),
  /** Pepper for OTP code hashing. In development, defaults to `jwtSecret` if unset. */
  otpPepper: "" as string,
  otpTtlMs: Number(process.env.OTP_TTL_MS) || 5 * 60 * 1000,
  /**
   * mock | http | digicoders. If SMS_PROVIDER is unset and SMS_API_URL is set, defaults to http
   * (DigiCoders / MSG91-style sendhttp.php).
   */
  smsProvider: (() => {
    const explicit = process.env.SMS_PROVIDER?.trim().toLowerCase();
    if (explicit === "mock") return "mock";
    if (explicit === "http" || explicit === "digicoders") return explicit;
    if (explicit) return explicit;
    return process.env.SMS_API_URL?.trim() ? "http" : "mock";
  })(),
  /** Base only, e.g. http://sms.digicoders.in/api/sendhttp.php (no ?authkey=…). */
  smsApiUrl: process.env.SMS_API_URL?.trim() ?? "",
  smsAuthKey: process.env.SMS_AUTH_KEY?.trim() ?? "",
  smsSenderId: process.env.SMS_SENDER?.trim() ?? "",
  smsRoute: process.env.SMS_ROUTE?.trim() ?? "",
  smsCountry: process.env.SMS_COUNTRY?.trim() || "91",
  smsDltTemplateId: process.env.SMS_DLT_TEMPLATE_ID?.trim() ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID?.trim() ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET?.trim() ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "",
  /** IANA timezone for schedule “today” / week boundaries (default Asia/Kolkata). */
  scheduleTz: (process.env.SCHEDULE_TZ ?? "Asia/Kolkata").trim() || "Asia/Kolkata",
  /** S3-compatible uploads for admin presigned PUT (optional until configured). */
  awsRegion: process.env.AWS_REGION?.trim() ?? "",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() ?? "",
  s3UploadBucket: process.env.S3_UPLOAD_BUCKET?.trim() ?? "",
  /** Public base URL for objects after upload, e.g. https://cdn.example.com or https://bucket.s3.region.amazonaws.com */
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "").trim() ?? "",
};

{
  const fromEnv = process.env.OTP_PEPPER?.trim();
  if (fromEnv) {
    env.otpPepper = fromEnv;
  } else if (isDeployed) {
    env.otpPepper = requireEnv("OTP_PEPPER", process.env.OTP_PEPPER);
  } else {
    env.otpPepper = env.jwtSecret;
  }
}
