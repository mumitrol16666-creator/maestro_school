export function assertLocalQaDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("QA operation blocked: set MAESTRO_QA_LOCAL=true explicitly.");
  }
  if (process.env.MAESTRO_QA_DB_MARKER !== "maestro-learning-regression") {
    throw new Error("QA operation blocked: MAESTRO_QA_DB_MARKER must be maestro-learning-regression.");
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("QA operation blocked: DATABASE_URL is invalid.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const allowedHosts = new Set(["localhost", "127.0.0.1", "postgres"]);
  if (!allowedHosts.has(parsed.hostname) || database !== "maestro_regression") {
    throw new Error("QA operation blocked: only the local maestro_regression database is allowed.");
  }
  if (/prod|production|neon|supabase|render/i.test(`${parsed.hostname}/${database}`)) {
    throw new Error("QA operation blocked: production-like DATABASE_URL is forbidden.");
  }
}

export function assertLocalE2eDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("E2E operation blocked: set MAESTRO_QA_LOCAL=true explicitly.");
  }

  const marker = process.env.MAESTRO_QA_DB_MARKER ?? "";
  const expectedDatabase = marker === "maestro-learning-regression"
    ? "maestro_regression"
    : marker === "maestro-local-qa"
      ? "maestro"
      : null;
  if (!expectedDatabase) {
    throw new Error("E2E operation blocked: only declared local Maestro QA markers are allowed.");
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("E2E operation blocked: DATABASE_URL is invalid.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const allowedHosts = new Set(["localhost", "127.0.0.1", "postgres"]);
  if (!allowedHosts.has(parsed.hostname) || database !== expectedDatabase) {
    throw new Error(`E2E operation blocked: marker ${marker} requires local database ${expectedDatabase}.`);
  }
  if (/prod|production|neon|supabase|render/i.test(`${parsed.hostname}/${database}`)) {
    throw new Error("E2E operation blocked: production-like DATABASE_URL is forbidden.");
  }
}
