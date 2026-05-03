import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    bookDemoSession?: { enrollmentId: string; phoneE164: string };
  }
}
