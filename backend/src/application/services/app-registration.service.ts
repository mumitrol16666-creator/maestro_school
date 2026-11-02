import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../infrastructure/database/prisma.js";
import { postAppRegistrationBooking } from "../../infrastructure/crm/crm-client.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";

/**
 * Stage 4, step 7: registration in the app. A person from outside the school gets a student
 * account with no CRM link (an «external» student); the school learns about them as a lead in CRM,
 * not as a CRM student. A parent can register themselves and their child in one go.
 */

/** A free login `prefix_<last 10 digits>[_n]`, 32 characters at most. */
export async function reserveLogin(prefix: "s" | "p", phoneDigits: string): Promise<string> {
  let candidate = `${prefix}_${phoneDigits.slice(-10)}`.slice(0, 32);
  let suffix = 0;
  while (await prisma.user.findFirst({ where: { login: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${prefix}_${phoneDigits.slice(-10)}_${suffix}`.slice(0, 32);
  }
  return candidate;
}

/**
 * Sends the lead to CRM. It never throws: CRM being down must not break a registration, the error
 * goes to the log (with the user id, so the lead can be added by hand).
 */
export async function sendAppRegistrationLead(params: {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  comment?: string;
}): Promise<boolean> {
  try {
    await postAppRegistrationBooking({
      externalSourceId: `app-registration:${params.userId}`,
      name: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      ...(params.comment ? { comment: params.comment } : {}),
    });
    return true;
  } catch (error) {
    console.error(
      `[app-registration] ERROR CRM lead was not sent for user ${params.userId}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export interface ParentRegistrationPerson {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}

function duplicatePhone(label: string) {
  return new ConflictError(
    `${label} уже зарегистрирован. Войдите в аккаунт или укажите другой номер.`,
    "PHONE_ALREADY_REGISTERED",
  );
}

/**
 * One transaction: the parent (role parent), the child (role student, no CRM link, outside the
 * league) and the link between them, made like the administrator makes it. If anything fails,
 * nothing is created. Phones must differ — the child signs in with their own phone — and each
 * must not belong to an existing account.
 */
export async function registerParentWithChild(input: {
  parent: ParentRegistrationPerson;
  child: ParentRegistrationPerson;
}) {
  const parentPhone = normalizePhoneDigits(input.parent.phone);
  const childPhone = normalizePhoneDigits(input.child.phone);
  if (!isValidPhone(input.parent.phone)) throw new BadRequestError("Укажите корректный номер телефона родителя", "PARENT_PHONE_INVALID");
  if (!isValidPhone(input.child.phone)) throw new BadRequestError("Укажите корректный номер телефона ребёнка", "CHILD_PHONE_INVALID");
  if (parentPhone === childPhone) {
    throw new BadRequestError(
      "У ребёнка должен быть свой номер телефона, отличный от вашего: по нему он будет входить в приложение.",
      "CHILD_PHONE_SAME_AS_PARENT",
    );
  }

  const [parentRole, studentRole] = await Promise.all([
    prisma.role.findUnique({ where: { slug: "parent" } }),
    prisma.role.findUnique({ where: { slug: "student" } }),
  ]);
  if (!parentRole || !studentRole) {
    throw new Error("Parent or student role is not configured. Run the production seed.");
  }

  const taken = await prisma.user.findMany({
    where: { phoneNormalized: { in: [parentPhone, childPhone] }, deletedAt: null, isActive: true },
    select: { phoneNormalized: true },
  });
  if (taken.some((row) => row.phoneNormalized === parentPhone)) throw duplicatePhone("Номер телефона родителя");
  if (taken.some((row) => row.phoneNormalized === childPhone)) throw duplicatePhone("Номер телефона ребёнка");

  const [parentLogin, childLogin, parentHash, childHash] = await Promise.all([
    reserveLogin("p", parentPhone),
    reserveLogin("s", childPhone),
    bcrypt.hash(input.parent.password, 10),
    bcrypt.hash(input.child.password, 10),
  ]);

  try {
    return await prisma.$transaction(async (tx) => {
      const parent = await tx.user.create({
        data: {
          login: parentLogin,
          email: null,
          phone: parentPhone,
          phoneNormalized: parentPhone,
          passwordHash: parentHash,
          firstName: input.parent.firstName.trim(),
          lastName: input.parent.lastName.trim(),
          roleId: parentRole.id,
          leagueEligible: false,
        },
      });
      const child = await tx.user.create({
        data: {
          login: childLogin,
          email: null,
          phone: childPhone,
          phoneNormalized: childPhone,
          passwordHash: childHash,
          firstName: input.child.firstName.trim(),
          lastName: input.child.lastName.trim(),
          roleId: studentRole.id,
          leagueEligible: false,
        },
      });
      await tx.parentStudentLink.create({
        data: {
          parentUserId: parent.id,
          studentUserId: child.id,
          relationship: "guardian",
          createdById: parent.id,
        },
      });
      return { parent, child };
    });
  } catch (error) {
    // A login or a phone taken by someone between the check and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "Не удалось создать аккаунты: логин или номер уже заняты. Попробуйте ещё раз.",
        "REGISTRATION_CONFLICT",
      );
    }
    throw error;
  }
}

/** The comment of the lead that a parent's registration sends: who the child is. */
export function parentRegistrationLeadComment(child: { firstName: string; lastName: string; phone: string }) {
  return `Ребёнок: ${child.firstName.trim()} ${child.lastName.trim()}, телефон ${normalizePhoneDigits(child.phone)}`;
}
