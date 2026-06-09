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
