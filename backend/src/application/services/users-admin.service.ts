import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";

export const ASSIGNABLE_ROLE_SLUGS = [
  "student",
  "teacher",
  "curator",
  "branch_manager",
  "admin",
  "owner",
] as const;

const ROLE_ASSIGNERS = ["admin", "owner"] as const;

export type AssignableRoleSlug = typeof ASSIGNABLE_ROLE_SLUGS[number];

export async function listAssignableRoles() {
  const roles = await prisma.role.findMany({
    where: { slug: { in: [...ASSIGNABLE_ROLE_SLUGS] } },
    select: { slug: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  return roles;
}

export async function listAdminUsers(input: {
  search?: string;
  role?: string;
  page: number;
  limit: number;
}) {
  const where = {
    ...notDeleted,
    ...(input.role ? { role: { slug: input.role } } : {}),
    ...(input.search
      ? {
          OR: [
            { firstName: { contains: input.search, mode: "insensitive" as const } },
            { lastName: { contains: input.search, mode: "insensitive" as const } },
            { login: { contains: input.search, mode: "insensitive" as const } },
            { email: { contains: input.search, mode: "insensitive" as const } },
            { phone: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
      select: {
        id: true,
        login: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        role: { select: { slug: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map((user) => ({
      id: user.id,
      login: user.login,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      role: user.role.slug,
      roleName: user.role.name,
    })),
    total,
  };
}

export async function getAdminUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...notDeleted },
    select: {
      id: true,
      login: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
      crmStudentId: true,
      crmTeacherId: true,
      externalLinkStatus: true,
      linkedAt: true,
      role: {
        select: {
          slug: true,
          name: true,
          description: true,
          rolePermissions: {
            include: { permission: { select: { code: true, description: true } } },
          },
        },
      },
    },
  });
  if (!user) throw new NotFoundError("User");

  return {
    id: user.id,
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    role: user.role.slug,
    roleName: user.role.name,
    roleDescription: user.role.description,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
    crmStudentId: user.crmStudentId,
    crmTeacherId: user.crmTeacherId,
    externalLinkStatus: user.externalLinkStatus,
    linkedAt: user.linkedAt?.toISOString() ?? null,
  };
}

async function countActiveAdmins(excludeUserId?: string) {
  return prisma.user.count({
    where: {
      ...notDeleted,
      isActive: true,
      role: { slug: "admin" },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

export async function updateAdminUserRole(input: {
  actorId: string;
  actorRole: string;
  userId: string;
  roleSlug: string;
}) {
  if (!(ROLE_ASSIGNERS as readonly string[]).includes(input.actorRole)) {
    throw new ForbiddenError("Назначать роли могут только администратор и владелец школы");
  }
  if (input.actorId === input.userId) {
    throw new BadRequestError("Нельзя изменить свою собственную роль");
  }
  if (!(ASSIGNABLE_ROLE_SLUGS as readonly string[]).includes(input.roleSlug as AssignableRoleSlug)) {
    throw new BadRequestError("Эту роль нельзя назначить через интерфейс");
  }

  const user = await prisma.user.findFirst({
    where: { id: input.userId, ...notDeleted },
    include: { role: { select: { slug: true } } },
  });
  if (!user) throw new NotFoundError("User");

  if (user.role.slug === "admin" && input.roleSlug !== "admin") {
    const remainingAdmins = await countActiveAdmins(input.userId);
    if (remainingAdmins === 0) {
      throw new BadRequestError("Нельзя снять роль у последнего администратора");
    }
  }

  const nextRole = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
  if (!nextRole) throw new BadRequestError("Роль не найдена");

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { roleId: nextRole.id },
    select: {
      id: true,
      login: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
      role: { select: { slug: true, name: true } },
    },
  });

  return {
    id: updated.id,
    login: updated.login,
    firstName: updated.firstName,
    lastName: updated.lastName,
    email: updated.email,
    phone: updated.phone,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
    role: updated.role.slug,
    roleName: updated.role.name,
  };
}
