import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  fetchCrmLinkStatusByPhone,
  fetchCrmProfileByPhone,
  postCrmUserLink,
} from "../../infrastructure/crm/crm-client.js";
import { normalizePhoneDigits } from "../../lib/phone.js";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { getUserLinkStatus } from "../repositories/user-link.repository.js";

export async function getAdminUserCrmLink(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: {
      id: true,
      phone: true,
      role: { select: { slug: true } },
      crmStudentId: true,
      crmTeacherId: true,
      externalLinkStatus: true,
      linkedAt: true,
    },
  });
  if (!user) throw new NotFoundError("User");

  const local = await getUserLinkStatus(user.phone);
  let crmLookup = null;
  let crmLinkStatus = null;

  try {
    crmLookup = await fetchCrmProfileByPhone(user.phone);
  } catch {
    crmLookup = { found: false };
  }

  try {
    crmLinkStatus = await fetchCrmLinkStatusByPhone(user.phone);
  } catch {
    crmLinkStatus = null;
  }

  return {
    appUserId: user.id,
    role: user.role.slug,
    crmStudentId: user.crmStudentId,
    crmTeacherId: user.crmTeacherId,
    externalLinkStatus: user.externalLinkStatus ?? local.data.status,
    linkedAt: user.linkedAt,
    local: local.data,
    crmLookup,
    crmLinkStatus,
  };
}

export async function linkAdminUserToCrm(userId: string, crmUserId?: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: { id: true, phone: true, role: { select: { slug: true } } },
  });
  if (!user) throw new NotFoundError("User");

  const digits = normalizePhoneDigits(user.phone);
  if (digits.length < 10) {
    throw new BadRequestError("У пользователя не указан корректный телефон");
  }

  let targetCrmId = crmUserId;
  if (!targetCrmId) {
    const lookup = await fetchCrmProfileByPhone(user.phone);
    if (!lookup.found || !lookup.crmUserId) {
      throw new BadRequestError("В CRM не найден ученик/преподаватель с этим телефоном");
    }
    targetCrmId = lookup.crmUserId;
  }

  const result = await postCrmUserLink({
    phone: user.phone,
    phoneNormalized: digits,
    crmStudentId: targetCrmId,
    appUserId: user.id,
    initiatedBy: "learning-platform",
  });

  const updated = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      crmStudentId: true,
      crmTeacherId: true,
      externalLinkStatus: true,
      linkedAt: true,
    },
  });

  return {
    status: result.status ?? "linked",
    crmStudentId: updated?.crmStudentId ?? null,
    crmTeacherId: updated?.crmTeacherId ?? null,
    externalLinkStatus: updated?.externalLinkStatus ?? "linked",
    linkedAt: updated?.linkedAt,
    crm: result.crm,
  };
}

export async function lookupCrmByPhone(phone: string) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) {
    throw new BadRequestError("Некорректный номер телефона");
  }
  return fetchCrmProfileByPhone(phone);
}
