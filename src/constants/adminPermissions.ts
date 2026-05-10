/** Fine-grained keys for `sub_admin`; role `admin` bypasses all checks. */
export const ADMIN_PERMISSIONS = {
  METRICS_READ: "metrics:read",
  ACTIVITY_READ: "activity:read",
  COURSES_READ: "courses:read",
  COURSES_WRITE: "courses:write",
  OUTLINE_WRITE: "outline:write",
  TEACHERS_WRITE: "teachers:write",
  SCHEDULE_WRITE: "schedule:write",
  FAQS_READ: "faqs:read",
  FAQS_WRITE: "faqs:write",
  COUPONS_WRITE: "coupons:write",
  TESTS_WRITE: "tests:write",
  ASSIGNMENTS_WRITE: "assignments:write",
  UPLOADS_WRITE: "uploads:write",
  AUDIT_READ: "audit:read",
} as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export type AdminJwtPayload = {
  sub: string;
  typ: "admin";
  role: "admin" | "sub_admin";
  email: string;
};

export type AdminRequestUser = {
  id: string;
  email: string;
  role: "admin" | "sub_admin";
  permissions: string[];
};
