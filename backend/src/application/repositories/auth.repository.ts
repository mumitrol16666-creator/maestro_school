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

export async function findUserWithRoleByPhone(phoneNormalized: string) {
  return prisma.user.findFirst({
    where: { phoneNormalized, ...notDeleted, isActive: true },
    include: userWithRoleInclude,
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

export async function updateUserProfile(
  userId: string,
  params: { firstName?: string; lastName?: string; phone?: string },
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
  crmStudentId?: string;
}) {
  const studentRole = await prisma.role.findUnique({ where: { slug: "student" } });
  if (!studentRole) {
    throw new Error("Student role is not configured. Run the production seed.");
  }

  const digits = params.phone.replace(/\D/g, "");

  return prisma.user.create({
    data: {
      login: params.login,
      email: params.email,
      phone: params.phone,
      phoneNormalized: digits,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      roleId: studentRole.id,
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
