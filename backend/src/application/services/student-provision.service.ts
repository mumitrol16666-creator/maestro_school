import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {
  createStudentUser,
  findUserWithRoleByEmail,
  findUserWithRoleByLogin,
} from "../repositories/auth.repository.js";
import {
  applyUserLink,
  findUserByCrmStudentId,
  findUserByPhoneNormalized,
} from "../repositories/user-link.repository.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";

export type ProvisionStudentInput = {
  crmStudentId: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  password?: string | null;
};

async function reserveUniqueLogin(base: string): Promise<string> {
  const normalized = normalizeLogin(base);
  if (!isValidLogin(normalized)) {
    throw new BadRequestError("Не удалось сформировать логин для ученика");
  }

  let candidate = normalized.slice(0, 32);
  let suffix = 0;
  while (await findUserWithRoleByLogin(candidate)) {
    suffix += 1;
    candidate = `${normalized.slice(0, 28)}_${suffix}`;
  }
  return candidate;
}

async function reserveUniqueEmail(crmStudentId: string, preferred?: string | null): Promise<string> {
  const trimmed = preferred?.trim().toLowerCase();
  if (trimmed) {
    const existing = await findUserWithRoleByEmail(trimmed);
    if (!existing) return trimmed;
  }

  const slug = crmStudentId.replace(/[^a-z0-9]/gi, "").slice(-16).toLowerCase() || "crm";
  let candidate = `student.${slug}@maestro.local`;
  let suffix = 0;
  while (await findUserWithRoleByEmail(candidate)) {
    suffix += 1;
    candidate = `student.${slug}.${suffix}@maestro.local`;
  }
  return candidate;
}

export async function provisionStudentFromCrm(input: ProvisionStudentInput) {
  const crmStudentId = input.crmStudentId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const digits = normalizePhoneDigits(input.phone);

  if (!crmStudentId) throw new BadRequestError("crmStudentId is required");
  if (!firstName) throw new BadRequestError("firstName is required");
  if (!isValidPhone(input.phone)) throw new BadRequestError("Invalid phone number");

  const byCrmId = await findUserByCrmStudentId(crmStudentId);
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
    if (byPhone.crmStudentId && byPhone.crmStudentId !== crmStudentId) {
      throw new ConflictError("Телефон уже привязан к другому ученику CRM");
    }

    const linkResult = await applyUserLink({
      appUserId: byPhone.id,
      phone: input.phone,
      phoneNormalized: digits,
      crmStudentId,
      crmRole: "student",
    });

    if (!linkResult.success) {
      if (linkResult.status === "conflict") throw new ConflictError(linkResult.error);
      throw new BadRequestError(linkResult.error);
    }

    return {
      created: false,
      linked: true,
      appUserId: byPhone.id,
      login: byPhone.login,
      email: byPhone.email,
      role: byPhone.role.slug,
    };
  }

  const login = await reserveUniqueLogin(`s_${digits.slice(-10)}`);
  const email = await reserveUniqueEmail(crmStudentId, input.email);
  const generatedPassword = input.password?.trim() || crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(generatedPassword, 10);

  let user;
  try {
    user = await createStudentUser({
      login,
      email,
      phone: input.phone,
      passwordHash,
      firstName,
      lastName,
      crmStudentId,
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
