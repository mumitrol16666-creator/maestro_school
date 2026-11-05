import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { applyPointsAccountRecovery, pointsRecoveryInput, previewPointsAccountRecovery } from "../src/application/services/points-account-recovery.service.js";
const [mode,file,fingerprint,actorId]=process.argv.slice(2);
try {
  if(!file || (mode!=="--dry-run" && mode!=="--apply") || (mode==="--apply" && (!fingerprint || !actorId))) throw new Error("Usage: tsx scripts/recover-points-account.ts --dry-run manifest.json OR --apply manifest.json reviewed-fingerprint operator-user-id");
  const input=pointsRecoveryInput.parse(JSON.parse(await readFile(file,"utf8")));
  const result=mode==="--dry-run"?await previewPointsAccountRecovery(input):await applyPointsAccountRecovery(input,fingerprint,actorId);
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
} catch(error) {process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;}
finally {await prisma.$disconnect();}
