import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import {
  assertStudentAccessCanBeArchived,
  buildArchivedLogin,
  isStudentAccessFullyArchived,
} from "../../domain/student-access-archive.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export type ArchiveStudentAccessInput = {
  appUserId: string;
  crmStudentId: string;
  force?: boolean;
};

export async function archiveStudentAccess(input: ArchiveStudentAccessInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.appUserId },
    include: { role: { select: { slug: true } } },
  });

  if (!user) throw new NotFoundError("Student account");
  if (user.role.slug !== "student") {
    throw new BadRequestError("Отключить этим действием можно только аккаунт ученика");
  }

  const isFullyArchived = isStudentAccessFullyArchived({
    ...user,
    userId: user.id,
  });

  if (isFullyArchived) {
    return {
      archived: true,
      alreadyArchived: true,
      appUserId: user.id,
      previousCrmStudentId: user.crmStudentId,
      historyPreserved: true,
    };
  }

  assertStudentAccessCanBeArchived({
    actualCrmStudentId: user.crmStudentId,
    requestedCrmStudentId: input.crmStudentId,
    force: input.force === true,
  });

  const archivedAt = new Date();
  const archivedLogin = buildArchivedLogin(user.id);
  const disabledPasswordHash = await bcrypt.hash(
    crypto.randomBytes(32).toString("base64url"),
    10,
  );

  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        deletedAt: archivedAt,
        login: archivedLogin,
        email: null,
        phoneNormalized: null,
        passwordHash: disabledPasswordHash,
        crmStudentId: null,
        externalLinkStatus: "unlinked",
        linkedAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        entityType: "user",
        entityId: user.id,
        action: "delete",
        payload: {
          mode: "archive_student_access",
          requestedCrmStudentId: input.crmStudentId,
          previousCrmStudentId: user.crmStudentId,
          forced: input.force === true,
          historyPreserved: true,
        },
      },
    }),
  ]);

  return {
    archived: true,
    alreadyArchived: false,
    appUserId: user.id,
    previousCrmStudentId: user.crmStudentId,
    archivedAt: archivedAt.toISOString(),
    historyPreserved: true,
  };
}
