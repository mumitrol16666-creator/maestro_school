import { prisma } from "../../infrastructure/database/prisma.js";
import { deleteLearningDialogFile } from "./learning-dialog-private-storage.service.js";

const RETENTION_BATCH_SIZE = 200;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runLearningDialogRetention(now = new Date()) {
  let deletedAttachments = 0;
  let purgedTextVersions = 0;

  while (true) {
    const attachments = await prisma.learningMessageAttachment.findMany({
      where: {
        deletedAt: null,
        conversation: { attachmentRetentionUntil: { lte: now } },
      },
      orderBy: { createdAt: "asc" },
      take: RETENTION_BATCH_SIZE,
      select: { id: true, storageKey: true },
    });
    if (attachments.length === 0) break;

    for (const attachment of attachments) {
      await deleteLearningDialogFile(attachment.storageKey);
    }
    const updated = await prisma.learningMessageAttachment.updateMany({
      where: { id: { in: attachments.map((attachment) => attachment.id) }, deletedAt: null },
      data: { deletedAt: now },
    });
    deletedAttachments += updated.count;
  }

  while (true) {
    const versions = await prisma.learningMessageVersion.findMany({
      where: {
        body: { not: null },
        message: { conversation: { textRetentionUntil: { lte: now } } },
      },
      orderBy: { createdAt: "asc" },
      take: RETENTION_BATCH_SIZE,
      select: { id: true },
    });
    if (versions.length === 0) break;
    const updated = await prisma.learningMessageVersion.updateMany({
      where: { id: { in: versions.map((version) => version.id) }, body: { not: null } },
      data: { body: null },
    });
    purgedTextVersions += updated.count;
  }

  return { deletedAttachments, purgedTextVersions };
}

export function startLearningDialogRetentionJob() {
  const run = () => {
    void runLearningDialogRetention().catch((error) => {
      console.error("Learning dialog retention failed", error);
    });
  };
  const firstRun = setTimeout(run, 60_000);
  firstRun.unref();
  const timer = setInterval(run, RETENTION_INTERVAL_MS);
  timer.unref();
  return timer;
}
