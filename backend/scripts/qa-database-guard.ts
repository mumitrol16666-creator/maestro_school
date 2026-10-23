import type { PrismaClient } from "@prisma/client";

export const QA_DATABASE_NAME = "maestro_regression";

// Connection-string options that cannot redirect the connection to another server.
// `host`, `hostaddr`, `socket`, `options` and the like are refused: they would let a URL that
// looks like localhost/maestro_regression open a different database.
const SAFE_URL_PARAMS = new Set([
  "schema",
  "connection_limit",
  "pool_timeout",
  "connect_timeout",
  "statement_cache_size",
]);

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
  if (!allowedHosts.has(parsed.hostname) || database !== QA_DATABASE_NAME) {
    throw new Error("QA operation blocked: only the local maestro_regression database is allowed.");
  }
  if (/prod|production|neon|supabase|render/i.test(`${parsed.hostname}/${database}`)) {
    throw new Error("QA operation blocked: production-like DATABASE_URL is forbidden.");
  }
  for (const key of parsed.searchParams.keys()) {
    if (!SAFE_URL_PARAMS.has(key)) {
      throw new Error(`QA operation blocked: DATABASE_URL option "${key}" is not allowed.`);
    }
  }
}

/**
 * Second check, against the server that actually answers: the URL can look right while the
 * connection goes elsewhere. Call after assertLocalQaDatabase() and before anything is written.
 */
export async function assertConnectedQaDatabase(client: Pick<PrismaClient, "$queryRaw">) {
  const rows = await client.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  const connected = rows[0]?.db;
  if (connected !== QA_DATABASE_NAME) {
    throw new Error(
      `QA operation blocked: connected to database "${connected ?? "unknown"}", expected ${QA_DATABASE_NAME}.`,
    );
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
