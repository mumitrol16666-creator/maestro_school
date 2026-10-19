/**
 * Plan 1.12: one-time import of files already in the media folder into the shared materials
 * library, with their saved titles. Safe to run again: files already in the library are skipped.
 *   npx tsx scripts/backfill-material-library.ts
 */
import { readdir } from "node:fs/promises";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { mediaDirectory, mediaFolders, mediaPath, readMediaMetadata } from "../src/application/services/media-storage.service.js";
import { materialKindFor } from "../src/application/services/material-library.service.js";

async function main() {
  let added = 0;
  let skipped = 0;
  for (const folder of mediaFolders) {
    let names: string[] = [];
    try {
      names = await readdir(mediaDirectory(folder));
    } catch {
      continue;
    }
    for (const filename of names) {
      if (filename.endsWith(".meta.json") || filename.startsWith(".")) continue;
      const url = mediaPath(folder, filename);
      if (await prisma.materialLibraryItem.findFirst({ where: { url } })) {
        skipped += 1;
        continue;
      }
      // Avatars live in the same folder; they are not school materials.
      if (await prisma.user.findFirst({ where: { avatar: { endsWith: url } }, select: { id: true } })) {
        skipped += 1;
        continue;
      }
      const metadata = await readMediaMetadata(folder, filename);
      const title = (metadata?.title || metadata?.originalFilename || filename).slice(0, 255);
      await prisma.materialLibraryItem.create({
        data: {
          kind: materialKindFor(url, metadata?.mimeType),
          title,
          url,
          mimeType: metadata?.mimeType ?? null,
          mediaFolder: folder,
          mediaFilename: filename,
        },
      });
      added += 1;
    }
  }
  console.log(`Material library backfill: added ${added}, skipped ${skipped}`);
}

main().finally(() => prisma.$disconnect());
