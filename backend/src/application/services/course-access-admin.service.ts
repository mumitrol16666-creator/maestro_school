import type { Prisma } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { formatSchoolDate, paidAccessExpiry } from "../../domain/course-payments.js";
import { formatFio } from "../../domain/name.js";
import { writeAuditLog } from "./audit.service.js";
import { deliverUserNotification } from "./notification.service.js";

/**
 * Stage 4: what an administrator does with course access outside a payment request — gives access
 * by hand, takes it back, reads the list for one student — and the payment details shown to payers.
 */

const MAX_GRANT_YEARS = 5;
/**
 * audit_logs.entity_id is a UUID column in the migrations (the Prisma schema says VarChar(191), but
 * no migration ever changed it), so the one-row settings table gets a fixed UUID.
 */
export const PAYMENT_SETTINGS_AUDIT_ID = "00000000-0000-4000-8000-000000000001";

function logSideEffectFailure(label: string, error: unknown) {
  console.error(`[course-access] ${label}`, error instanceof Error ? error.message : error);
}

export type CourseAccessListStatus = "active" | "expired" | "revoked" | "scheduled";

export function accessListStatus(
  access: { startsAt: Date; expiresAt: Date; revokedAt: Date | null },
  now: Date,
): CourseAccessListStatus {
  if (access.revokedAt) return "revoked";
  if (access.startsAt.getTime() > now.getTime()) return "scheduled";
  return access.expiresAt.getTime() > now.getTime() ? "active" : "expired";
}

const nameSelect = { id: true, firstName: true, lastName: true, middleName: true } as const;

const accessInclude = {
  course: { select: { id: true, title: true } },
  grantedBy: { select: nameSelect },
  revokedBy: { select: nameSelect },
  paymentRequest: { select: { id: true, amountKzt: true, payerUserId: true, refundedAt: true } },
} satisfies Prisma.CourseAccessInclude;

async function loadAccessView(accessId: string, now: Date) {
  const row = await prisma.courseAccess.findUnique({ where: { id: accessId }, include: accessInclude });
  if (!row) throw new NotFoundError("Course access");
  return accessView(row, now);
}

function accessView(
  row: Prisma.CourseAccessGetPayload<{ include: typeof accessInclude }>,
  now: Date,
) {
  return {
    id: row.id,
    studentId: row.studentId,
    course: row.course,
    source: row.source,
    status: accessListStatus(row, now),
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    grantedBy: row.grantedBy ? { id: row.grantedBy.id, name: formatFio(row.grantedBy) } : null,
    grantNote: row.grantNote,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy ? { id: row.revokedBy.id, name: formatFio(row.revokedBy) } : null,
    revokeReason: row.revokeReason,
    revokeNote: row.revokeNote,
    payment: row.paymentRequest
      ? {
          requestId: row.paymentRequest.id,
          amountKzt: row.paymentRequest.amountKzt,
          refundedAt: row.paymentRequest.refundedAt,
        }
      : null,
    createdAt: row.createdAt,
  };
}

async function assertStudent(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, ...notDeleted },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Student");
  return student;
}

/** All accesses of one student, newest first. */
export async function listStudentCourseAccess(studentId: string, now = new Date()) {
  await assertStudent(studentId);
  const rows = await prisma.courseAccess.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: accessInclude,
  });
  return rows.map((row) => accessView(row, now));
}

/**
 * Gives a student access to a course without a payment. The reason is required — it stays in the
 * list and in the audit log. The term defaults to six months, like a paid access.
 */
export async function grantCourseAccess(params: {
  studentId: string;
  courseId: string;
  actorId: string;
  note: string | null | undefined;
  expiresAt?: Date | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const note = params.note?.trim() ?? "";
  if (note.length < 3) throw new BadRequestError("Укажите причину выдачи доступа (не короче 3 символов)");
  const expiresAt = params.expiresAt ?? paidAccessExpiry(now);
  if (expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestError("Срок доступа должен быть в будущем");
  }
  const limit = new Date(now);
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_GRANT_YEARS);
  if (expiresAt.getTime() > limit.getTime()) {
    throw new BadRequestError(`Срок доступа не может быть больше ${MAX_GRANT_YEARS} лет`);
  }

  await assertStudent(params.studentId);
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, ...notDeleted },
    select: { id: true, title: true },
  });
  if (!course) throw new NotFoundError("Course");

  const created = await prisma.$transaction(async (tx) => {
    const access = await tx.courseAccess.create({
      data: {
        studentId: params.studentId,
        courseId: course.id,
        source: "admin_grant",
        startsAt: now,
        expiresAt,
        grantedById: params.actorId,
        grantNote: note.slice(0, 1000),
      },
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_access",
      entityId: access.id,
      action: "create",
      actorId: params.actorId,
      payload: {
        event: "granted",
        studentId: params.studentId,
        courseId: course.id,
        expiresAt: expiresAt.toISOString(),
        note: note.slice(0, 1000),
      },
    });
    return access;
  });

  await deliverUserNotification({
    userId: params.studentId,
    type: "course_access_granted",
    title: "Открыт доступ к курсу",
    body: `Курс «${course.title}» открыт до ${formatSchoolDate(expiresAt)}.`,
    url: `/courses/${course.id}`,
    tag: `course-access-${created.id}`,
    dedupeKey: `course-access:granted:${created.id}:${params.studentId}`,
  }).catch((error) => logSideEffectFailure("grant notification failed", error));
  return loadAccessView(created.id, now);
}

/**
 * Takes an access back. The payment request (if any) is left as it is: money is returned with
 * the separate «refund» action, which closes the access too.
 */
export async function revokeCourseAccess(params: {
  accessId: string;
  actorId: string;
  note?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const note = params.note?.trim().slice(0, 1000) || null;
  const access = await prisma.$transaction(async (tx) => {
    const closed = await tx.courseAccess.updateMany({
      where: { id: params.accessId, revokedAt: null },
      data: { revokedAt: now, revokedById: params.actorId, revokeReason: "admin", revokeNote: note },
    });
    if (closed.count === 0) {
      const exists = await tx.courseAccess.findUnique({ where: { id: params.accessId }, select: { id: true } });
      if (!exists) throw new NotFoundError("Course access");
      throw new ConflictError("Доступ уже закрыт.", "ACCESS_ALREADY_REVOKED");
    }
    const row = await tx.courseAccess.findUniqueOrThrow({
      where: { id: params.accessId },
      include: accessInclude,
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_access",
      entityId: row.id,
      action: "update",
      actorId: params.actorId,
      payload: { event: "revoked", studentId: row.studentId, courseId: row.courseId, note },
    });
    return row;
  });

  const recipients = new Set([access.studentId]);
  // A parent who paid hears about it too.
  if (access.paymentRequest && access.paymentRequest.payerUserId !== access.studentId) {
    recipients.add(access.paymentRequest.payerUserId);
  }
  await Promise.allSettled([...recipients].map((userId) => deliverUserNotification({
    userId,
    type: "course_access_revoked",
    title: "Доступ к курсу закрыт",
    body: `Доступ к курсу «${access.course.title}» закрыт администратором.`,
    url: userId === access.studentId ? `/courses/${access.course.id}` : `/family?student=${access.studentId}&notice=course`,
    tag: `course-access-${access.id}-revoked`,
    dedupeKey: `course-access:revoked:${access.id}:${userId}`,
  }).catch((error) => logSideEffectFailure("revoke notification failed", error))));
  return accessView(access, now);
}

// ─── Payment details ────────────────────────────────────────────────────────────

export interface PaymentSettingsInput {
  kaspiPayUrl: string | null;
  transferPhone: string | null;
  recipientName: string | null;
  hint: string | null;
}

export async function getPaymentSettings() {
  const row = await prisma.coursePaymentSettings.findUnique({
    where: { id: 1 },
    include: { updatedBy: { select: nameSelect } },
  });
  return {
    kaspiPayUrl: row?.kaspiPayUrl ?? null,
    transferPhone: row?.transferPhone ?? null,
    recipientName: row?.recipientName ?? null,
    hint: row?.hint ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ? { id: row.updatedBy.id, name: formatFio(row.updatedBy) } : null,
  };
}

/** Details are one row for the school; an empty field is stored as null. */
export async function updatePaymentSettings(input: PaymentSettingsInput, actorId: string) {
  const clean = (value: string | null) => value?.trim() || null;
  const data = {
    kaspiPayUrl: clean(input.kaspiPayUrl),
    transferPhone: clean(input.transferPhone),
    recipientName: clean(input.recipientName),
    hint: clean(input.hint),
    updatedById: actorId,
  };
  await prisma.$transaction(async (tx) => {
    await tx.coursePaymentSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_payment_settings",
      entityId: PAYMENT_SETTINGS_AUDIT_ID,
      action: "update",
      actorId,
      payload: {
        kaspiPayUrl: data.kaspiPayUrl,
        transferPhone: data.transferPhone,
        recipientName: data.recipientName,
        hint: data.hint,
      },
    });
  });
  return getPaymentSettings();
}
