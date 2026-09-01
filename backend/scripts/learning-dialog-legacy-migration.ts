import {
  applyLearningDialogLegacyMigration,
  previewLearningDialogLegacyMigration,
  type LearningDialogLegacyMigrationOverrides,
} from "../src/application/services/learning-dialog-legacy-migration.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

function assertLocalDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Legacy dialog migration requires MAESTRO_QA_LOCAL=true");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "postgres", "db", "host.docker.internal"].includes(hostname)) {
    throw new Error(`Refusing legacy dialog migration against non-local database host: ${hostname}`);
  }
  if (/prod|production|neon|supabase|render/i.test(databaseUrl)) {
    throw new Error("Refusing legacy dialog migration against a production-like database URL");
  }
}

function overridesFromEnv(): LearningDialogLegacyMigrationOverrides {
  const raw = process.env.LEARNING_DIALOG_LEGACY_MAP_JSON?.trim();
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("LEARNING_DIALOG_LEGACY_MAP_JSON must be a JSON object");
  }
  for (const [legacyConversationId, targetConversationId] of Object.entries(parsed)) {
    if (typeof targetConversationId !== "string") {
      throw new Error(`Target for ${legacyConversationId} must be a conversation UUID`);
    }
  }
  return parsed as LearningDialogLegacyMigrationOverrides;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const explicitDryRun = process.argv.includes("--dry-run");
  if (apply && explicitDryRun) throw new Error("Choose either --dry-run or --apply");
  assertLocalDatabase();
  if (apply && process.env.CONFIRM !== "learning-dialogs-v2") {
    throw new Error("Apply requires CONFIRM=learning-dialogs-v2");
  }
  const overrides = overridesFromEnv();
  const preview = await previewLearningDialogLegacyMigration(overrides);
  console.log(JSON.stringify({ mode: apply ? "apply-preview" : "dry-run", preview }, null, 2));
  if (!apply) return;
  if (preview.blockers.length > 0) {
    throw new Error(`Apply blocked by unmapped conversations: ${preview.blockers.join("; ")}`);
  }
  const result = await applyLearningDialogLegacyMigration(overrides);
  console.log(JSON.stringify({ mode: "apply-result", result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
