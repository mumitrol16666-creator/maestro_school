import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../infrastructure/database/prisma.js";
import { postAppRegistrationBooking } from "../../infrastructure/crm/crm-client.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { createStudentUser } from "../repositories/auth.repository.js";
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

type Tx = Prisma.TransactionClient;

/**
 * Takes a transaction-scoped advisory lock per phone, so two registrations on the same phone run one
 * after the other and the second sees the first one's account. There is deliberately no unique index
 * on the phone (production may hold duplicate phones, the migration would fail). Several phones are
 * locked in one stable order, so two parent registrations can never wait for each other.
 */
async function lockRegistrationPhones(tx: Tx, phones: string[]) {
  for (const phone of [...new Set(phones)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`register-phone:${phone}`}))`;
  }
}

function duplicatePhone(label: string) {
  return new ConflictError(
    `${label} уже зарегистрирован. Войдите в аккаунт или укажите другой номер.`,
    "PHONE_ALREADY_REGISTERED",
  );
}

/** Refuses a phone that an active account already has. Must run after `lockRegistrationPhones`. */
async function assertPhonesFree(tx: Tx, phones: Array<{ phone: string; label: string }>) {
  const taken = await tx.user.findMany({
    where: { phoneNormalized: { in: phones.map((item) => item.phone) }, deletedAt: null, isActive: true },
    select: { phoneNormalized: true },
  });
  for (const item of phones) {
    if (taken.some((row) => row.phoneNormalized === item.phone)) throw duplicatePhone(item.label);
  }
}

/**
 * Registration on the user's own (`POST /auth/register`): the student account with no CRM link, made
 * in one transaction with the phone check, behind the phone lock. The lead is still to be sent, so the
 * account is marked `crmLeadPendingSince`.
 */
export async function registerExternalStudent(input: {
  login: string;
  email: string | null;
  phone: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
}) {
  const phone = normalizePhoneDigits(input.phone);
  return prisma.$transaction(async (tx) => {
    await lockRegistrationPhones(tx, [phone]);
    await assertPhonesFree(tx, [{ phone, label: "Номер телефона" }]);
    return createStudentUser({ ...input, phone, crmLeadPendingSince: new Date(), client: tx });
  });
}

/**
 * Sends the lead to CRM. It never throws: CRM being down must not break a registration, the error
 * goes to the log (with the user id, so the lead can be added by hand). CRM accepting the lead — new or
 * «already there» for the same externalSourceId — clears `crmLeadPendingSince`; a failure leaves it, and
 * the job in `app-registration-lead-job.service.ts` sends the lead again.
 */
export async function sendAppRegistrationLead(params: {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  comment?: string;
  /** The retry job passes false: a failed retry is not worth a line every ten minutes. */
  logFailure?: boolean;
}): Promise<boolean> {
  try {
    await postAppRegistrationBooking({
      externalSourceId: `app-registration:${params.userId}`,
      name: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      ...(params.comment ? { comment: params.comment } : {}),
    });
  } catch (error) {
    if (params.logFailure !== false) {
      console.error(
        `[app-registration] ERROR CRM lead was not sent for user ${params.userId}:`,
        error instanceof Error ? error.message : error,
      );
    }
    return false;
  }
  try {
    await prisma.user.updateMany({ where: { id: params.userId }, data: { crmLeadPendingSince: null } });
  } catch (error) {
    // The lead is in CRM; the flag stays and the job sends it once more, which CRM answers «already there».
    console.error(`[app-registration] CRM lead sent, but the flag of user ${params.userId} was not cleared:`, error);
  }
  return true;
}

export interface ParentRegistrationPerson {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
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

  const [parentLogin, childLogin, parentHash, childHash] = await Promise.all([
    reserveLogin("p", parentPhone),
    reserveLogin("s", childPhone),
    bcrypt.hash(input.parent.password, 10),
    bcrypt.hash(input.child.password, 10),
  ]);

  try {
    return await prisma.$transaction(async (tx) => {
      // Both phones are locked and checked in the same transaction as the inserts: no registration can
      // slip in between the check and the insert.
      await lockRegistrationPhones(tx, [parentPhone, childPhone]);
      await assertPhonesFree(tx, [
        { phone: parentPhone, label: "Номер телефона родителя" },
        { phone: childPhone, label: "Номер телефона ребёнка" },
      ]);
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
          // The one lead of this registration is the parent's.
          crmLeadPendingSince: new Date(),
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
    // A login taken by someone between `reserveLogin` and the insert (logins have a unique index).
    // Phones are not caught here: there is no unique index on them, the phone lock above covers them.
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
