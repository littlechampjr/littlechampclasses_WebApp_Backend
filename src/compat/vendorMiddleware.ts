/**
 * Helmet + express-rate-limit default exports resolve as non-callable module types
 * under TypeScript moduleResolution "NodeNext" on some installs (e.g. Vercel).
 * Narrow to the real middleware signatures.
 */
import type { Options as RateLimitOptions } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { HelmetOptions } from "helmet";
import rateLimitImport from "express-rate-limit";
import helmetImport from "helmet";

export const helmet = helmetImport as unknown as (
  options?: Readonly<HelmetOptions>,
) => RequestHandler;

export const rateLimit = rateLimitImport as unknown as (
  options?: Partial<RateLimitOptions>,
) => RequestHandler;
