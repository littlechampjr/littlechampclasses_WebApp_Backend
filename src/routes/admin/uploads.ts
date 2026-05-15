import { Router } from "express";
import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../../constants/adminPermissions.js";
import { requireAdminAuth, requirePermission } from "../../middleware/adminAuth.js";
import { presignPutUpload } from "../../services/s3Presign.js";
import { asyncHandler } from "../../util/asyncHandler.js";

export const adminUploadsRouter = Router();

adminUploadsRouter.use(requireAdminAuth);

const presignBody = z.object({
  keySuffix: z.string().min(1).max(512),
  contentType: z.string().min(1).max(200),
});

adminUploadsRouter.post(
  "/presign",
  requirePermission(ADMIN_PERMISSIONS.UPLOADS_WRITE),
  asyncHandler(async (req, res) => {
    const parsed = presignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const result = await presignPutUpload({
      keySuffix: parsed.data.keySuffix,
      contentType: parsed.data.contentType,
    });
    if (!result.ok) {
      res.status(503).json({ error: result.error });
      return;
    }
    res.json(result);
  }),
);
