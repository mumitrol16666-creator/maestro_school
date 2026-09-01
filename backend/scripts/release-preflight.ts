import "dotenv/config";

const failures: string[] = [];

const featureKeys = [
  "FEATURE_LEARNING_TOPICS_V2",
  "FEATURE_STUDENT_WORKSPACE_V2",
  "FEATURE_HOMEWORK_FLOW_V2",
  "FEATURE_UNIFIED_LESSON_V2",
  "FEATURE_LESSON_SYNC_V2",
  "FEATURE_REWARD_ECONOMY_V2",
  "FEATURE_CURATOR_WORKSPACE_V2",
  "FEATURE_LEARNING_DIALOGS_V2",
  "FEATURE_ROLE_NAVIGATION_V2",
] as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name} is required`);
  return value ?? "";
}

function secureSecret(name: string, minimumLength = 32) {
  const value = required(name);
  if (!value) return;
  if (value.length < minimumLength) {
    failures.push(`${name} must contain at least ${minimumLength} characters`);
  }
  if (/change[-_ ]?me|replace|example|local-maestro|super_secure/i.test(value)) {
    failures.push(`${name} still contains a placeholder or local-only value`);
  }
}

function parsedUrl(name: string, protocols: string[]) {
  const value = required(name);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      failures.push(`${name} must use ${protocols.join(" or ")}`);
    }
    return url;
  } catch {
    failures.push(`${name} must be a valid URL`);
    return null;
  }
}

if (process.env.NODE_ENV !== "production") {
  failures.push("NODE_ENV must be production");
}

if (!['127.0.0.1', 'localhost'].includes(required("HOST"))) {
  failures.push("HOST must bind the production API to loopback only");
}

parsedUrl("DATABASE_URL", ["postgresql:", "postgres:"]);
secureSecret("JWT_SECRET");
secureSecret("INTEGRATION_SERVICE_SECRET");
secureSecret("INTEGRATION_SSO_SECRET");

for (const origin of required("CORS_ORIGIN").split(",").map((value) => value.trim()).filter(Boolean)) {
  try {
    if (new URL(origin).protocol !== "https:") failures.push("Every CORS_ORIGIN must use https");
  } catch {
    failures.push("CORS_ORIGIN contains an invalid URL");
  }
}

const crmUrl = parsedUrl("CRM_API_URL", ["http:", "https:"]);
if (crmUrl && !["127.0.0.1", "localhost"].includes(crmUrl.hostname)) {
  failures.push("CRM_API_URL must use the private loopback API");
}

const releaseSha = required("RELEASE_SHA");
if (releaseSha && !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  failures.push("RELEASE_SHA must be a full 40-character Git SHA");
}
const builtAt = required("RELEASE_BUILT_AT");
if (builtAt && Number.isNaN(Date.parse(builtAt))) {
  failures.push("RELEASE_BUILT_AT must be a valid ISO datetime");
}

const cutoverAt = required("PRODUCT_V2_CUTOVER_AT");
if (cutoverAt && (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(cutoverAt) || Number.isNaN(Date.parse(cutoverAt)))) {
  failures.push("PRODUCT_V2_CUTOVER_AT must be a valid ISO datetime with an explicit UTC offset");
}

const enabledFeatures = new Set<string>();
for (const key of featureKeys) {
  const value = required(key).toLowerCase();
  if (!["true", "false"].includes(value)) {
    failures.push(`${key} must be explicitly true or false`);
  } else if (value === "true") {
    enabledFeatures.add(key);
  }
}

const fileFeaturesEnabled = enabledFeatures.has("FEATURE_HOMEWORK_FLOW_V2")
  || enabledFeatures.has("FEATURE_LEARNING_DIALOGS_V2");
if (fileFeaturesEnabled) {
  if (process.env.PRIVATE_STORAGE_DRIVER !== "s3") {
    failures.push("PRIVATE_STORAGE_DRIVER must be s3 when homework or dialogs V2 is enabled");
  }
  if (process.env.MALWARE_SCANNER_DRIVER !== "clamav") {
    failures.push("MALWARE_SCANNER_DRIVER must be clamav when homework or dialogs V2 is enabled");
  }
  parsedUrl("S3_ENDPOINT", ["https:"]);
  required("S3_REGION");
  required("S3_BUCKET");
  secureSecret("S3_ACCESS_KEY_ID", 16);
  secureSecret("S3_SECRET_ACCESS_KEY", 32);
  required("CLAMAV_HOST");
  required("CLAMAV_PORT");
}

const uploadDir = required("UPLOAD_DIR");
if (uploadDir && !uploadDir.startsWith("/")) {
  failures.push("UPLOAD_DIR must be an absolute persistent path in production");
}

const vapidValues = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]
  .map((name) => Boolean(process.env[name]?.trim()));
if (vapidValues.some(Boolean) && !vapidValues.every(Boolean)) {
  failures.push("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured together");
}

if (failures.length) {
  console.error("Learning Platform release preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Learning Platform release preflight passed with ${enabledFeatures.size} enabled feature flags.`);
