import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { normalizePhoneDigits } from "../../lib/phone.js";

export async function findUsersByPhoneNormalized(phoneNormalized: string) {
  const digits = normalizePhoneDigits(phoneNormalized);
  if (!digits) return [];

  return prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      OR: [
        { phoneNormalized: digits },
        { phone: digits },
      ],
    },
    include: {
      role: true,
      teacherProfile: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findUserByPhoneNormalized(phoneNormalized: string) {
  const users = await findUsersByPhoneNormalized(phoneNormalized);
  return users.length === 1 ? users[0] : null;
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
  force?: boolean;
}) {
  const digits = normalizePhoneDigits(params.phoneNormalized || params.phone || "");
  let user = null;

  if (params.appUserId) {
    user = await findUserByAppUserId(params.appUserId);
  }
  if (!user && digits) {
    const candidates = await findUsersByPhoneNormalized(digits);
    if (candidates.length > 1) {
      return {
        success: false as const,
        error: "По этому номеру найдено несколько аккаунтов. Выберите аккаунт по логину.",
        status: "ambiguous" as const,
      };
    }
    user = candidates[0] ?? null;
  }

  if (!user) {
    return { success: false as const, error: "App user not found for this phone" };
  }

  if (params.crmStudentId) {
    const existing = await findUserByCrmStudentId(params.crmStudentId);
    if (existing && existing.id !== user.id) {
      if (params.force) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { crmStudentId: null, externalLinkStatus: "unlinked", linkedAt: null },
        });
      } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { externalLinkStatus: "conflict" },
      });
      return { success: false as const, error: "crmStudentId already linked to another App user", status: "conflict" as const };
      }
    }
  }

  if (params.crmTeacherId) {
    const existing = await findUserByCrmTeacherId(params.crmTeacherId);
    if (existing && existing.id !== user.id) {
      if (params.force) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { crmTeacherId: null, externalLinkStatus: "unlinked", linkedAt: null },
        });
      } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { externalLinkStatus: "conflict" },
      });
      return { success: false as const, error: "crmTeacherId already linked to another App user", status: "conflict" as const };
      }
    }
  }

  if (user.crmStudentId && params.crmStudentId && user.crmStudentId !== params.crmStudentId) {
    if (!params.force) {
      return { success: false as const, error: "App user already linked to a different CRM student", status: "conflict" as const };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { crmStudentId: null, externalLinkStatus: "unlinked", linkedAt: null },
    });
  }

  if (user.crmTeacherId && params.crmTeacherId && user.crmTeacherId !== params.crmTeacherId) {
    if (!params.force) {
      return { success: false as const, error: "App user already linked to a different CRM teacher", status: "conflict" as const };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { crmTeacherId: null, externalLinkStatus: "unlinked", linkedAt: null },
    });
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

export async function linkUserToCrm(
  userId: string,
  crmStudentId: string,
  phoneNormalized: string,
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      crmStudentId,
      phoneNormalized,
      externalLinkStatus: "linked",
      linkedAt: new Date(),
    },
  });
}

export async function getUserLinkStatus(phoneNormalized: string) {
  const digits = normalizePhoneDigits(phoneNormalized);
  const users = await findUsersByPhoneNormalized(digits);

  if (users.length === 0) {
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

  const candidate = (user: (typeof users)[number]) => ({
    appUserId: user.id,
    crmStudentId: user.crmStudentId,
    crmTeacherId: user.crmTeacherId,
    status: user.externalLinkStatus
      || (user.crmStudentId || user.crmTeacherId ? "linked" : "unlinked"),
    linkedAt: user.linkedAt,
    appUser: {
      id: user.id,
      login: user.login,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role.slug,
    },
  });

  if (users.length > 1) {
    return {
      success: true as const,
      data: {
        phoneNormalized: digits,
        status: "manual_review" as const,
        appUserId: null,
        crmStudentId: null,
        crmTeacherId: null,
        appUser: null,
        candidates: users.map(candidate),
      },
    };
  }

  const user = users[0];
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
        login: user.login,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role.slug,
      },
    },
  };
}
