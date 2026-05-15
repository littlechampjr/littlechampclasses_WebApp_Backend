import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "../env.js";

function client(): S3Client | null {
  if (!env.awsRegion || !env.awsAccessKeyId || !env.awsSecretAccessKey) return null;
  return new S3Client({
    region: env.awsRegion,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    },
  });
}

export type PresignPutResult =
  | { ok: true; uploadUrl: string; method: "PUT"; headers: Record<string, string>; publicUrl: string }
  | { ok: false; error: string };

/** Returns presigned PUT URL and final public URL for simple key-based uploads. */
export async function presignPutUpload(params: {
  /** Relative path under bucket, e.g. uploads/foo.pdf */
  keySuffix: string;
  contentType: string;
  maxSeconds?: number;
}): Promise<PresignPutResult> {
  const bucket = env.s3UploadBucket;
  const base = env.s3PublicBaseUrl;
  if (!bucket || !base) {
    return {
      ok: false,
      error:
        "S3 uploads are not configured (set S3_UPLOAD_BUCKET, S3_PUBLIC_BASE_URL, AWS_REGION, credentials).",
    };
  }
  const c = client();
  if (!c) {
    return { ok: false, error: "S3 client not configured (missing AWS credentials)." };
  }

  const safeSuffix = params.keySuffix.replace(/^\/+/, "").replace(/\.\./g, "");
  const key = `${safeSuffix}` || `uploads/${randomUUID()}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(c, cmd, {
    expiresIn: params.maxSeconds ?? 900,
  });

  const publicUrl = `${base.replace(/\/$/, "")}/${key}`;

  return {
    ok: true,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": params.contentType },
    publicUrl,
  };
}
