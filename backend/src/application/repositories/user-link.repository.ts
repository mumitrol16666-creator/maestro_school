import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { normalizePhoneDigits } from "../../lib/phone.js";

export async function findUserByPhoneNormalized(phoneNormalized: string) {
  const digits = normalizePhoneDigits(phoneNormalized);
  if (!digits) return null;

  const users = await prisma.user.findMany({
    where: { ...notDeleted, isActive: true },
    include: {
      role: true,
      teacherProfile: true,
    },
  });

  return users.find((user) => normalizePhoneDigits(user.phone) === digits) ?? null;
}

export async function findUserByCrmStudentId(crmStudentId: string) {
  return prisma.user.findFirst({
    where: { crmStudentId, ...notDeleted },
    include: { role: true },
  });
}

export async function findUserByCrmTeacherId(crmTeacherId: string) {
  return prisma.user.findFirst({
    where: { crmTeacherId, ...notDeleted },
    include: { role: true },
  });
}

export async function findUserByAppUserId(appUserId: string) {
  return prisma.user.findFirst({
    where: { id: appUserId, ...notDeleted },
    include: { role: true },
  });
}

export async function applyUserLink(params: {
  appUserId?: string;
  phone?: string;
  phoneNormalized: string;
  crmStudentId?: string;
  crmTeacherId?: string;
  crmRole?: string;
}) {
  const digits = normalizePhoneDigits(params.phoneNormalized || params.phone || "");
  let user = null;

  if (params.appUserId) {
    user = await findUserByAppUserId(params.appUserId);
  }
  if (!user && digits) {
    user = await findUserByPhoneNormalized(digits);
  }

  if (!user) {
    return { success: false as const, error: "App user not found for this phone" };
  }

  if (params.crmStudentId) {
    const existing = await findUserByCrmStudentId(params.crmStudentId);
    if (existing && existing.id !== user.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { externalLinkStatus: "conflict" },
      });
      return { success: false as const, error: "crmStudentId already linked to another App user", status: "conflict" as const };
    }
  }

  if (params.crmTeacherId) {
    const existing = await findUserByCrmTeacherId(params.crmTeacherId);
    if (existing && existing.id !== user.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { externalLinkStatus: "conflict" },
      });
      return { success: false as const, error: "crmTeacherId already linked to another App user", status: "conflict" as const };
    }
  }

  if (user.crmStudentId && params.crmStudentId && user.crmStudentId !== params.crmStudentId) {
    return { success: false as const, error: "App user already linked to a different CRM student", status: "conflict" as const };
  }

  if (user.crmTeacherId && params.crmTeacherId && user.crmTeacherId !== params.crmTeacherId) {
    return { success: false as const, error: "App user already linked to a different CRM teacher", status: "conflict" as const };
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    phoneNormalized: digits,
    externalLinkStatus: "linked",
    linkedAt: now,
  };

  if (params.crmStudentId) data.crmStudentId = params.crmStudentId;
  if (params.crmTeacherId) data.crmTeacherId = params.crmTeacherId;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    include: { role: true },
  });

  return {
    success: true as const,
    data: {
      appUserId: updated.id,
      crmStudentId: updated.crmStudentId,
      crmTeacherId: updated.crmTeacherId,
      status: updated.externalLinkStatus,
      linkedAt: updated.linkedAt,
      appUser: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        role: updated.role.slug,
      },
    },
  };
}

export async function getUserLinkStatus(phoneNormalized: string) {
  const digits = normalizePhoneDigits(phoneNormalized);
  const user = await findUserByPhoneNormalized(digits);

  if (!user) {
    return {
      success: true as const,
      data: {
        phoneNormalized: digits,
        status: "unlinked" as const,
        appUserId: null,
        crmStudentId: null,
        crmTeacherId: null,
        appUser: null,
      },
    };
  }

  const linked = Boolean(user.crmStudentId || user.crmTeacherId);
  return {
    success: true as const,
    data: {
      phoneNormalized: digits,
      status: user.externalLinkStatus || (linked ? "linked" : "unlinked"),
      appUserId: user.id,
      crmStudentId: user.crmStudentId,
      crmTeacherId: user.crmTeacherId,
      linkedAt: user.linkedAt,
      appUser: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role.slug,
      },
    },
  };
}
