import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import {
  deletePrivateObject,
  privateObjectExists,
  putPrivateTextObject,
  readPrivateTextObject,
} from "../src/application/services/private-object-storage.service.js";
import { scanFileWithClamAv } from "../src/application/services/malware-scanner.service.js";
import { BadRequestError } from "../src/domain/errors.js";

const EICAR_TEST_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function verifyPrivateStorage() {
  if (env.PRIVATE_STORAGE_DRIVER !== "s3") {
    throw new Error("Production dependency check requires PRIVATE_STORAGE_DRIVER=s3");
  }

  const key = `_release-probe/${env.RELEASE_SHA}-${randomUUID()}.json`;
  const payload = JSON.stringify({ releaseSha: env.RELEASE_SHA, probe: randomUUID() });
  try {
    await putPrivateTextObject(key, payload);
    if (!await privateObjectExists(key)) throw new Error("S3 probe object is not visible after upload");
    if (await readPrivateTextObject(key) !== payload) throw new Error("S3 probe content does not match");
  } finally {
    await deletePrivateObject(key).catch(() => undefined);
  }
}

async function verifyMalwareScanner() {
  if (env.MALWARE_SCANNER_DRIVER !== "clamav") {
    throw new Error("Production dependency check requires MALWARE_SCANNER_DRIVER=clamav");
  }

  const probeDir = path.resolve(env.UPLOAD_DIR, "release-probes");
  const cleanPath = path.join(probeDir, `${randomUUID()}-clean.txt`);
  const infectedPath = path.join(probeDir, `${randomUUID()}-eicar.txt`);
  await mkdir(probeDir, { recursive: true });
  try {
    await writeFile(cleanPath, "Maestro release dependency probe", "utf8");
    await scanFileWithClamAv({
      filePath: cleanPath,
      host: env.CLAMAV_HOST,
      port: env.CLAMAV_PORT,
      timeoutMs: env.CLAMAV_TIMEOUT_MS,
    });

    await writeFile(infectedPath, EICAR_TEST_SIGNATURE, "ascii");
    let rejected = false;
    try {
      await scanFileWithClamAv({
        filePath: infectedPath,
        host: env.CLAMAV_HOST,
        port: env.CLAMAV_PORT,
        timeoutMs: env.CLAMAV_TIMEOUT_MS,
      });
    } catch (error) {
      rejected = error instanceof BadRequestError;
      if (!rejected) throw error;
    }
    if (!rejected) throw new Error("ClamAV did not reject the standard antivirus test signature");
  } finally {
    await Promise.all([
      unlink(cleanPath).catch(() => undefined),
      unlink(infectedPath).catch(() => undefined),
    ]);
  }
}

async function main() {
  await verifyPrivateStorage();
  await verifyMalwareScanner();
  console.log("Learning Platform production dependencies are ready.");
}

main().catch((error) => {
  console.error("Learning Platform dependency preflight failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
