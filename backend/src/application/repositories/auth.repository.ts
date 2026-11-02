import type { Prisma } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";

const userWithRoleInclude = {
  role: {
    include: {
      rolePermissions: { include: { permission: true } },
    },
  },
} as const;

export async function findUserWithRoleByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, ...notDeleted, isActive: true },
    include: userWithRoleInclude,
  });
}

export async function findUserWithRoleByLogin(login: string) {
  return prisma.user.findFirst({
    where: { login, ...notDeleted, isActive: true },
    include: userWithRoleInclude,
  });
}

export async function findUserWithRoleByLoginOrEmail(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) {
    return findUserWithRoleByEmail(value);
  }
  return findUserWithRoleByLogin(value);
}

export async function findUsersWithRoleByPhone(phoneNormalized: string) {
  return prisma.user.findMany({
    where: { phoneNormalized, ...notDeleted, isActive: true },
    include: userWithRoleInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function findUserWithRoleById(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, ...notDeleted, isActive: true },
    include: userWithRoleInclude,
  });
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

/** The user's own change in the app: CRM learns its copy of the password is no longer current. */
export async function updateOwnPassword(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedInAppAt: new Date() },
  });
}

export async function updateUserProfile(
  userId: string,
  params: {
    firstName?: string;
    lastName?: string;
    middleName?: string | null;
    phone?: string;
    phoneNormalized?: string;
    avatar?: string | null;
    profileBio?: string | null;
    profileInstrument?: string | null;
    profileInterests?: string[];
    profilePublic?: boolean;
  },
) {
  return prisma.user.update({
    where: { id: userId },
    data: params,
    include: userWithRoleInclude,
  });
}

export async function createStudentUser(params: {
  login: string | null;
  email: string | null;
  phone: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  crmStudentId?: string;
  /** Registration in the app: the lead for CRM is still to be sent. */
  crmLeadPendingSince?: Date;
  /** A transaction to work in; the default is the shared client. */
  client?: Prisma.TransactionClient;
}) {
  const db = params.client ?? prisma;
  const studentRole = await db.role.findUnique({ where: { slug: "student" } });
  if (!studentRole) {
    throw new Error("Student role is not configured. Run the production seed.");
  }

  const digits = params.phone.replace(/\D/g, "");

  return db.user.create({
    data: {
      login: params.login,
      email: params.email,
      phone: params.phone,
      phoneNormalized: digits,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      middleName: params.middleName,
      roleId: studentRole.id,
      ...(params.crmLeadPendingSince ? { crmLeadPendingSince: params.crmLeadPendingSince } : {}),
      // The league is for students of the school: a person without a CRM link starts outside it.
      leagueEligible: Boolean(params.crmStudentId),
      ...(params.crmStudentId
        ? {
            crmStudentId: params.crmStudentId,
            externalLinkStatus: "linked",
            linkedAt: new Date(),
          }
        : {}),
    },
    include: userWithRoleInclude,
  });
}

export async function createTeacherUser(params: {
  login: string;
  email: string;
  phone: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  crmTeacherId: string;
  bio?: string | null;
}) {
  const teacherRole = await prisma.role.findUnique({ where: { slug: "teacher" } });
  if (!teacherRole) {
    throw new Error("Teacher role is not configured. Run the production seed.");
  }

  const digits = params.phone.replace(/\D/g, "");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        login: params.login,
        email: params.email,
        phone: params.phone,
        phoneNormalized: digits,
        passwordHash: params.passwordHash,
        firstName: params.firstName,
        lastName: params.lastName,
        middleName: params.middleName,
        roleId: teacherRole.id,
        crmTeacherId: params.crmTeacherId,
        externalLinkStatus: "linked",
        linkedAt: new Date(),
      },
      include: userWithRoleInclude,
    });

    await tx.teacher.create({
      data: {
        userId: user.id,
        bio: params.bio ?? null,
      },
    });

    return user;
  });
}
