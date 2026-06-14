import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  createTeacherUser,
  findUserWithRoleByEmail,
  findUserWithRoleByLogin,
} from "../repositories/auth.repository.js";
import {
  applyUserLink,
  findUserByCrmTeacherId,
  findUserByPhoneNormalized,
} from "../repositories/user-link.repository.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export type ProvisionTeacherInput = {
  crmTeacherId: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  password?: string | null;
  bio?: string | null;
};

async function reserveUniqueLogin(base: string): Promise<string> {
  const normalized = normalizeLogin(base);
  if (!isValidLogin(normalized)) {
    throw new BadRequestError("Не удалось сформировать логин для преподавателя");
  }

  let candidate = normalized.slice(0, 32);
  let suffix = 0;
  while (await findUserWithRoleByLogin(candidate)) {
    suffix += 1;
    candidate = `${normalized.slice(0, 28)}_${suffix}`;
  }
  return candidate;
}

async function reserveUniqueEmail(crmTeacherId: string, preferred?: string | null): Promise<string> {
  const trimmed = preferred?.trim().toLowerCase();
  if (trimmed) {
    const existing = await findUserWithRoleByEmail(trimmed);
    if (!existing) return trimmed;
  }

  const slug = crmTeacherId.replace(/[^a-z0-9]/gi, "").slice(-16).toLowerCase() || "crm";
  let candidate = `teacher.${slug}@maestro.local`;
  let suffix = 0;
  while (await findUserWithRoleByEmail(candidate)) {
    suffix += 1;
    candidate = `teacher.${slug}.${suffix}@maestro.local`;
  }
  return candidate;
}

async function ensureTeacherRole(userId: string, bio?: string | null) {
  const teacherRole = await prisma.role.findUnique({ where: { slug: "teacher" } });
  if (!teacherRole) {
    throw new BadRequestError("Роль teacher не настроена в платформе");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { roleId: teacherRole.id },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
      teacherProfile: true,
    },
  });

  if (!user.teacherProfile) {
    await prisma.teacher.create({
      data: {
        userId: user.id,
        bio: bio ?? null,
      },
    });
  } else if (bio) {
    await prisma.teacher.update({
      where: { userId: user.id },
      data: { bio },
    });
  }

  return user;
}

export async function provisionTeacherFromCrm(input: ProvisionTeacherInput) {
  const crmTeacherId = input.crmTeacherId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const digits = normalizePhoneDigits(input.phone);

  if (!crmTeacherId) throw new BadRequestError("crmTeacherId is required");
  if (!firstName || !lastName) throw new BadRequestError("firstName and lastName are required");
  if (!isValidPhone(input.phone)) throw new BadRequestError("Invalid phone number");

  const byCrmId = await findUserByCrmTeacherId(crmTeacherId);
  if (byCrmId) {
    return {
      created: false,
      linked: true,
      appUserId: byCrmId.id,
      login: byCrmId.login,
      email: byCrmId.email,
      role: byCrmId.role.slug,
    };
  }

  const byPhone = await findUserByPhoneNormalized(digits);
  if (byPhone) {
    if (byPhone.crmTeacherId && byPhone.crmTeacherId !== crmTeacherId) {
      throw new ConflictError("Телефон уже привязан к другому преподавателю CRM");
    }

    const linkResult = await applyUserLink({
      appUserId: byPhone.id,
      phone: input.phone,
      phoneNormalized: digits,
      crmTeacherId,
      crmRole: "teacher",
    });

    if (!linkResult.success) {
      if (linkResult.status === "conflict") throw new ConflictError(linkResult.error);
      throw new BadRequestError(linkResult.error);
    }

    const upgraded = await ensureTeacherRole(byPhone.id, input.bio);

    return {
      created: false,
      linked: true,
      appUserId: upgraded.id,
      login: upgraded.login,
      email: upgraded.email,
      role: upgraded.role.slug,
    };
  }

  const login = await reserveUniqueLogin(`t_${digits.slice(-10)}`);
  const email = await reserveUniqueEmail(crmTeacherId, input.email);
  const generatedPassword = input.password?.trim() || crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(generatedPassword, 10);

  let user;
  try {
    user = await createTeacherUser({
      login,
      email,
      phone: input.phone,
      passwordHash,
      firstName,
      lastName,
      crmTeacherId,
      bio: input.bio,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Пользователь с таким телефоном или CRM ID уже существует");
    }
    throw error;
  }

  return {
    created: true,
    linked: true,
    appUserId: user.id,
    login: user.login,
    email: user.email,
    role: user.role.slug,
    ...(input.password ? {} : { temporaryPassword: generatedPassword }),
  };
}
