import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@maestro.local"),
  INTEGRATION_SERVICE_SECRET: z.string().min(16).optional(),
  INTEGRATION_SSO_SECRET: z.string().min(16).optional(),
  CRM_API_URL: z.string().default("http://127.0.0.1:5000"),
  PRIVATE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MALWARE_SCANNER_DRIVER: z.enum(["none", "clamav"]).default("none"),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: optionalNonEmptyString,
  S3_BUCKET: optionalNonEmptyString,
  S3_ACCESS_KEY_ID: optionalNonEmptyString,
  S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  S3_SERVER_SIDE_ENCRYPTION: z.enum(["AES256"]).optional(),
  CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
  RELEASE_SHA: z.string().trim().regex(/^(unknown|[0-9a-f]{40})$/i).default("unknown"),
  RELEASE_BUILT_AT: z.union([
    z.literal("unknown"),
    z.string().datetime({ offset: true }),
  ]).default("unknown"),
});

export const env = envSchema.parse(process.env);

if (process.env.NODE_ENV === "production") {
  const missing: string[] = [];
  if (!process.env.CORS_ORIGIN) missing.push("CORS_ORIGIN");
  if (!process.env.CRM_API_URL) missing.push("CRM_API_URL");
  if (!process.env.INTEGRATION_SERVICE_SECRET) missing.push("INTEGRATION_SERVICE_SECRET");
  if (!process.env.INTEGRATION_SSO_SECRET) missing.push("INTEGRATION_SSO_SECRET");
  if (missing.length) {
    throw new Error(`Production environment is missing required variables: ${missing.join(", ")}`);
  }
}
