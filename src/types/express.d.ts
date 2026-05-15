import "express-serve-static-core";

import type { AdminRequestUser } from "../constants/adminPermissions.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    bookDemoSession?: { enrollmentId: string; phoneE164: string };
    admin?: AdminRequestUser;
  }
}
