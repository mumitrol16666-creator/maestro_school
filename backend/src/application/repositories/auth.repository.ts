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
  login: string;
  email: string;
  phone: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
}) {
  const studentRole = await prisma.role.findUnique({ where: { slug: "student" } });
  if (!studentRole) {
    throw new Error("Student role is not configured. Run the production seed.");
  }

  return prisma.user.create({
    data: {
      login: params.login,
      email: params.email,
      phone: params.phone,
      phoneNormalized: params.phone,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      roleId: studentRole.id,
    },
    include: userWithRoleInclude,
  });
}
