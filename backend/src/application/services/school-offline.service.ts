import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";

export async function getStudentSchoolOfflineSummary(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId },
    select: { crmStudentId: true, externalLinkStatus: true },
  });

  if (!user?.crmStudentId) {
    throw new BadRequestError(
      "Профиль школы не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }

  const summary = await fetchStudentOfflineSummary(user.crmStudentId);
  return {
    ...summary,
    linkStatus: user.externalLinkStatus ?? "linked",
  };
}
