import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";

export async function findUserWithRoleByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, ...notDeleted, isActive: true },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  });
}

export async function findUserWithRoleById(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, ...notDeleted, isActive: true },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  });
}

export async function createStudentUser(params: {
  email: string;
  phone?: string;
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
      email: params.email,
      phone: params.phone,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      roleId: studentRole.id,
    },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  });
}
