import { loadProductFeatureConfig } from "../src/config/product-features.js";
import {
  applyEconomicEpochCutover,
  ECONOMY_V2_EPOCH_CODE,
  previewEconomicEpochCutover,
} from "../src/application/services/economic-epoch.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

function assertLocalApply() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Economic cutover apply blocked: MAESTRO_QA_LOCAL=true is required.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const localDatabase = /@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(databaseUrl)
    && !/prod|production|neon|supabase|render/i.test(databaseUrl);
  if (!localDatabase) {
    throw new Error("Economic cutover apply blocked: DATABASE_URL is not a local QA database.");
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;
  if (apply && dryRun && process.argv.includes("--dry-run")) {
    throw new Error("Choose either --dry-run or --apply.");
  }

  const config = loadProductFeatureConfig();
  const preview = await previewEconomicEpochCutover({
    code: ECONOMY_V2_EPOCH_CODE,
    startsAt: config.cutoverAt,
  });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", preview }, null, 2));
  if (!apply) return;
  assertLocalApply();
  if (preview.blockers.length > 0) {
    throw new Error(`Economic cutover blocked: ${preview.blockers.join("; ")}`);
  }
  const result = await applyEconomicEpochCutover({
    code: ECONOMY_V2_EPOCH_CODE,
    startsAt: config.cutoverAt,
  });
  console.log(JSON.stringify({ mode: "apply-result", result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
