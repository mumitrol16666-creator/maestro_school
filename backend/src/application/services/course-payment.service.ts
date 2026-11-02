import { Prisma } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../domain/errors.js";
import {
  courseIsForSale,
  resolveCourseAccess,
} from "../../domain/course-access.js";
import {
  buildPaymentsCsv,
  formatSchoolDate,
  formatSchoolDateTime,
  formatTenge,
  paidAccessExpiry,
  parsePeriodEndExclusive,
  parsePeriodStart,
  paymentDisplayStatus,
  type CoursePaymentDisplayStatus,
  type PaymentCsvRow,
} from "../../domain/course-payments.js";
import { formatFio } from "../../domain/name.js";
import { appPublicUrl } from "../../config/app-url.js";
import { writeAuditLog } from "./audit.service.js";
import { assertParentChildLink } from "./family.service.js";
import {
  courseAccessDto,
  getCourseAccessState,
  getCourseAccessStates,
} from "./course-access.service.js";
import {
  deliverUserNotification,
  listUsersWithPermission,
} from "./notification.service.js";
import { escapeTelegramHtml, sendTelegramMessage } from "./telegram.service.js";

/**
 * Stage 4: «Я оплатил». A student (or a parent for a child) sends a request with the price of the
 * moment; an administrator confirms it (this opens six months of access), rejects it with a reason,
 * or later refunds it (this closes the access). The money itself moves outside the app — the
 * request is the school's record of it. Points are never taken back by a refund.
 *
 *   pending ──confirm──▶ confirmed ──refund──▶ confirmed + refundedAt  («refunded» for people)
 *      └─────reject────▶ rejected
 *
 * Every transition is one conditional update on the current status, so two administrators (or a
 * double click) cannot both win.
 */

export const PAYMENT_MANAGE_PERMISSION = "course_payments.manage";

const nameSelect = { id: true, firstName: true, lastName: true, middleName: true } as const;
const personSelect = {
  ...nameSelect,
  phone: true,
  crmStudentId: true,
  role: { select: { slug: true } },
} as const;

type Person = Prisma.UserGetPayload<{ select: typeof personSelect }>;
type NamePart = Prisma.UserGetPayload<{ select: typeof nameSelect }>;

const requestInclude = {
  course: { select: { id: true, title: true, priceKzt: true } },
  student: { select: personSelect },
  payer: { select: personSelect },
  decidedBy: { select: nameSelect },
  refundedBy: { select: nameSelect },
  access: { select: { id: true, startsAt: true, expiresAt: true, revokedAt: true, revokeReason: true } },
} satisfies Prisma.CoursePaymentRequestInclude;

type RequestRow = Prisma.CoursePaymentRequestGetPayload<{ include: typeof requestInclude }>;

function fullName(person: NamePart | null | undefined) {
  return person ? formatFio(person) : "";
}

/** First name and surname only: what a chat message may carry. */
function shortName(person: NamePart) {
  return [person.firstName, person.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
}

function logSideEffectFailure(label: string, error: unknown) {
  console.error(`[course-payments] ${label}`, error instanceof Error ? error.message : error);
}

// ─── What a student or a parent sees ────────────────────────────────────────────

export function studentRequestView(row: RequestRow, viewerUserId: string | null = null) {
  const display = paymentDisplayStatus(row);
  return {
    id: row.id,
    courseId: row.courseId,
    courseTitle: row.course.title,
    amountKzt: row.amountKzt,
    status: row.status,
    displayStatus: display,
    payerNote: row.payerNote,
    /** The reason, shown only when the request was rejected. */
    rejectionReason: row.status === "rejected" ? row.decisionNote : null,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    refundedAt: row.refundedAt,
    paidBy: row.payerUserId === row.studentId ? "student" as const : "parent" as const,
    paidByViewer: viewerUserId ? row.payerUserId === viewerUserId : null,
    access: row.access && !row.access.revokedAt
      ? { startsAt: row.access.startsAt, expiresAt: row.access.expiresAt }
      : null,
  };
}

export async function getCoursePaymentDetails() {
  const settings = await prisma.coursePaymentSettings.findUnique({ where: { id: 1 } });
  const clean = (value: string | null | undefined) => value?.trim() || null;
  const details = {
    kaspiPayUrl: clean(settings?.kaspiPayUrl),
    transferPhone: clean(settings?.transferPhone),
    recipientName: clean(settings?.recipientName),
    hint: clean(settings?.hint),
  };
  return { ...details, configured: Boolean(details.kaspiPayUrl || details.transferPhone) };
}

/**
 * The state of one course for one student: access, the last request with the rejection reason, and
 * where to pay. `viewerUserId` is the student or the parent who looks.
 */
export async function getCoursePaymentView(params: {
  studentId: string;
  courseId: string;
  viewerUserId: string;
}) {
  const [state, course, lastRequest, paymentDetails] = await Promise.all([
    getCourseAccessState(params.studentId, params.courseId),
    prisma.course.findFirst({
      where: { id: params.courseId, ...notDeleted, isPublished: true },
      select: { id: true, title: true, priceKzt: true, includedInSchool: true, freeLessonsCount: true },
    }),
    prisma.coursePaymentRequest.findFirst({
      where: { studentId: params.studentId, courseId: params.courseId },
      orderBy: { createdAt: "desc" },
      include: requestInclude,
    }),
    getCoursePaymentDetails(),
  ]);
  if (!course) throw new NotFoundError("Course");
  const blockedBy = !state.forSale
    ? "not_for_sale" as const
    : state.kind === "school"
      ? "school" as const
      : state.pendingPaymentRequest
        ? "pending" as const
        : null;
  return {
    course: {
      id: course.id,
      title: course.title,
      priceKzt: course.priceKzt,
      includedInSchool: course.includedInSchool,
      freeLessonsCount: course.freeLessonsCount,
    },
    access: courseAccessDto(state),
    canRequestPayment: blockedBy === null,
    blockedBy,
    lastRequest: lastRequest ? studentRequestView(lastRequest, params.viewerUserId) : null,
    paymentDetails,
  };
}

export async function listStudentPaymentRequests(studentId: string, viewerUserId: string = studentId) {
  const rows = await prisma.coursePaymentRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: requestInclude,
  });
  return rows.map((row) => studentRequestView(row, viewerUserId));
}

/** The published courses with the child's access and price, for the parent's «Курсы {ребёнка}». */
export async function listChildCourses(parentUserId: string, studentId: string) {
  await assertParentChildLink(parentUserId, studentId);
  const courses = await prisma.course.findMany({
    where: { ...notDeleted, isPublished: true },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnail: true,
      priceKzt: true,
      includedInSchool: true,
      freeLessonsCount: true,
    },
  });
  const states = await getCourseAccessStates(studentId, courses);
  return courses.map((course) => ({
    ...course,
    access: courseAccessDto(states.get(course.id)!),
  }));
}

export async function getChildCoursePaymentView(parentUserId: string, studentId: string, courseId: string) {
  await assertParentChildLink(parentUserId, studentId);
  return getCoursePaymentView({ studentId, courseId, viewerUserId: parentUserId });
}

// ─── The request ────────────────────────────────────────────────────────────────

function pendingError() {
  return new ConflictError(
    "Заявка на оплату этого курса уже отправлена. Дождитесь проверки.",
    "PAYMENT_REQUEST_PENDING",
  );
}

function adminRequestUrl(requestId: string) {
  return `/admin/course-payments?request=${encodeURIComponent(requestId)}`;
}

async function notifyAdminsAboutRequest(row: RequestRow) {
  const recipients = await listUsersWithPermission(PAYMENT_MANAGE_PERMISSION);
  const payer = row.payerUserId === row.studentId ? "" : ` Платит родитель: ${shortName(row.payer)}.`;
  await Promise.allSettled(recipients.map((recipient) => deliverUserNotification({
    userId: recipient.id,
    type: "course_payment_requested",
    title: "Новая оплата курса",
    body: `${shortName(row.student)}: «${row.course.title}», ${formatTenge(row.amountKzt)}.${payer}`,
    url: adminRequestUrl(row.id),
    tag: `course-payment-${row.id}`,
    dedupeKey: `course-payment:requested:${row.id}:${recipient.id}`,
  }).catch((error) => logSideEffectFailure("admin notification failed", error))));
}

/** Plain text for the chat: course, amount, names, a link. No phones, no notes. */
export function buildPaymentTelegramMessage(row: {
  id: string;
  amountKzt: number;
  payerNote?: string | null;
  course: { title: string };
  student: NamePart;
  payer: NamePart;
  payerUserId: string;
  studentId: string;
}, baseUrl: string | null = appPublicUrl()) {
  const lines = [
    "<b>Новая оплата курса</b>",
    `Курс: ${escapeTelegramHtml(row.course.title)}`,
    `Сумма: ${escapeTelegramHtml(formatTenge(row.amountKzt))}`,
    `Ученик: ${escapeTelegramHtml(shortName(row.student))}`,
    row.payerUserId === row.studentId
      ? "Платил: ученик"
      : `Платил: родитель ${escapeTelegramHtml(shortName(row.payer))}`,
  ];
  if (baseUrl) {
    lines.push(`<a href="${escapeTelegramHtml(`${baseUrl}${adminRequestUrl(row.id)}`)}">Открыть заявку</a>`);
  }
  return lines.join("\n");
}

/**
 * Creates «Я оплатил» for `studentId`, pressed by `payerUserId` (the student or a parent).
 * The amount is a snapshot of the current price. Returns the request and the promise of the
 * Telegram message — the caller may ignore it, a failure there never reaches the request.
 */
export async function createPaymentRequest(params: {
  courseId: string;
  studentId: string;
  payerUserId: string;
  payerNote?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const course = await prisma.course.findFirst({
    where: { id: params.courseId, ...notDeleted, isPublished: true },
    select: { id: true, priceKzt: true, includedInSchool: true, freeLessonsCount: true },
  });
  if (!course) throw new NotFoundError("Course");
  if (!courseIsForSale(course)) {
    throw new ConflictError("Этот курс бесплатный, оплата не нужна.", "COURSE_NOT_FOR_SALE");
  }
  const student = await prisma.user.findFirst({
    where: { id: params.studentId, role: { slug: "student" }, ...notDeleted, isActive: true },
    select: { id: true, crmStudentId: true },
  });
  if (!student) throw new NotFoundError("Student");
  // Included in the school and linked to CRM: nothing to pay. Paid or granted access does not
  // block a new request — buying again is allowed, the administrator sees a warning (assumption 3).
  const school = resolveCourseAccess({
    course,
    linkedToSchool: Boolean(student.crmStudentId),
    grants: [],
    now,
  });
  if (school.kind === "school") {
    throw new ConflictError("Этот курс уже входит в обучение школы.", "COURSE_ALREADY_OPEN");
  }

  const waiting = await prisma.coursePaymentRequest.findFirst({
    where: { studentId: student.id, courseId: course.id, status: "pending" },
    select: { id: true },
  });
  if (waiting) throw pendingError();

  let created: { id: string };
  try {
    created = await prisma.coursePaymentRequest.create({
      data: {
        courseId: course.id,
        studentId: student.id,
        payerUserId: params.payerUserId,
        amountKzt: course.priceKzt!,
        payerNote: params.payerNote?.trim() || null,
      },
      select: { id: true },
    });
  } catch (error) {
    // Two presses at once: the partial unique index lets only one pending request live.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw pendingError();
    throw error;
  }

  const row = await prisma.coursePaymentRequest.findUniqueOrThrow({
    where: { id: created.id },
    include: requestInclude,
  });
  await writeAuditLog({
    entityType: "course_payment_request",
    entityId: row.id,
    action: "create",
    actorId: params.payerUserId,
    payload: { event: "requested", courseId: row.courseId, studentId: row.studentId, amountKzt: row.amountKzt },
  }).catch((error) => logSideEffectFailure("audit write failed", error));

  // After the request is stored: neither the app notification nor Telegram can undo it.
  await notifyAdminsAboutRequest(row).catch((error) => logSideEffectFailure("admin notification failed", error));
  const telegram = sendTelegramMessage(buildPaymentTelegramMessage(row)).catch((error) => {
    logSideEffectFailure("telegram failed", error);
    return false;
  });

  return { request: studentRequestView(row, params.payerUserId), telegram };
}

export async function createChildPaymentRequest(params: {
  parentUserId: string;
  studentId: string;
  courseId: string;
  payerNote?: string | null;
}) {
  await assertParentChildLink(params.parentUserId, params.studentId);
  return createPaymentRequest({
    courseId: params.courseId,
    studentId: params.studentId,
    payerUserId: params.parentUserId,
    payerNote: params.payerNote,
  });
}

// ─── Answers to the student and to the parent who paid ──────────────────────────

/** The student, and the parent when the parent was the one who paid. */
async function notifyStudentAndPayer(
  row: Pick<RequestRow, "id" | "studentId" | "payerUserId" | "course" | "student">,
  event: string,
  copy: (audience: "student" | "parent") => {
    type: "course_access_granted" | "course_payment_rejected" | "course_access_revoked";
    title: string;
    body: string;
  },
) {
  const audiences: Array<{ userId: string; audience: "student" | "parent" }> = [
    { userId: row.studentId, audience: "student" },
  ];
  if (row.payerUserId !== row.studentId) audiences.push({ userId: row.payerUserId, audience: "parent" });
  await Promise.allSettled(audiences.map(({ userId, audience }) => {
    const text = copy(audience);
    return deliverUserNotification({
      userId,
      type: text.type,
      title: text.title,
      body: text.body,
      url: audience === "student"
        ? `/courses/${row.course.id}`
        : `/family?student=${row.studentId}&notice=course`,
      tag: `course-payment-${row.id}-${event}`,
      dedupeKey: `course-payment:${event}:${row.id}:${userId}`,
    }).catch((error) => logSideEffectFailure(`${event} notification failed`, error));
  }));
}

/** «Курс «X»» for the student, «Курс «X» для Имя» for the parent. */
function courseLabel(row: Pick<RequestRow, "course" | "student">, audience: "student" | "parent") {
  return audience === "student"
    ? `«${row.course.title}»`
    : `«${row.course.title}» для ${shortName(row.student)}`;
}

// ─── The administrator ──────────────────────────────────────────────────────────

function requireNote(note: string | null | undefined, label: string) {
  const text = note?.trim() ?? "";
  if (text.length < 3) throw new BadRequestError(label);
  return text.slice(0, 1000);
}

async function failTransition(
  client: Prisma.TransactionClient,
  requestId: string,
  conflict: { message: string; code: string },
): Promise<never> {
  const existing = await client.coursePaymentRequest.findUnique({
    where: { id: requestId },
    select: { status: true, refundedAt: true },
  });
  if (!existing) throw new NotFoundError("Payment request");
  throw new ConflictError(conflict.message, conflict.code);
}

const NOT_PENDING = { message: "Заявка уже обработана.", code: "PAYMENT_REQUEST_NOT_PENDING" };

export async function confirmPaymentRequest(params: {
  requestId: string;
  actorId: string;
  note?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const flipped = await tx.coursePaymentRequest.updateMany({
      where: { id: params.requestId, status: "pending" },
      data: {
        status: "confirmed",
        decidedById: params.actorId,
        decidedAt: now,
        decisionNote: params.note?.trim().slice(0, 1000) || null,
      },
    });
    if (flipped.count === 0) await failTransition(tx, params.requestId, NOT_PENDING);
    const row = await tx.coursePaymentRequest.findUniqueOrThrow({
      where: { id: params.requestId },
      include: requestInclude,
    });
    const access = await tx.courseAccess.create({
      data: {
        studentId: row.studentId,
        courseId: row.courseId,
        source: "payment",
        paymentRequestId: row.id,
        startsAt: now,
        expiresAt: paidAccessExpiry(now),
        grantedById: params.actorId,
      },
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_payment_request",
      entityId: row.id,
      action: "update",
      actorId: params.actorId,
      payload: {
        event: "confirmed",
        courseId: row.courseId,
        studentId: row.studentId,
        amountKzt: row.amountKzt,
        accessId: access.id,
        expiresAt: access.expiresAt.toISOString(),
      },
    });
    return { row, access };
  });

  await notifyStudentAndPayer(result.row, "confirmed", (audience) => ({
    type: "course_access_granted",
    title: "Оплата подтверждена",
    body: `Курс ${courseLabel(result.row, audience)} открыт до ${formatSchoolDate(result.access.expiresAt)}.`,
  }));
  const fresh = await prisma.coursePaymentRequest.findUniqueOrThrow({ where: { id: result.row.id }, include: requestInclude });
  return adminRequestView(fresh, new Map());
}

export async function rejectPaymentRequest(params: {
  requestId: string;
  actorId: string;
  note: string | null | undefined;
  now?: Date;
}) {
  const note = requireNote(params.note, "Укажите причину отказа (не короче 3 символов)");
  const now = params.now ?? new Date();
  const row = await prisma.$transaction(async (tx) => {
    const flipped = await tx.coursePaymentRequest.updateMany({
      where: { id: params.requestId, status: "pending" },
      data: { status: "rejected", decidedById: params.actorId, decidedAt: now, decisionNote: note },
    });
    if (flipped.count === 0) await failTransition(tx, params.requestId, NOT_PENDING);
    const loaded = await tx.coursePaymentRequest.findUniqueOrThrow({
      where: { id: params.requestId },
      include: requestInclude,
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_payment_request",
      entityId: loaded.id,
      action: "update",
      actorId: params.actorId,
      payload: { event: "rejected", courseId: loaded.courseId, studentId: loaded.studentId, note },
    });
    return loaded;
  });

  await notifyStudentAndPayer(row, "rejected", (audience) => ({
    type: "course_payment_rejected",
    title: "Оплата не найдена",
    body: `Курс ${courseLabel(row, audience)}: ${note}`,
  }));
  return adminRequestView(row, new Map());
}

export async function refundPaymentRequest(params: {
  requestId: string;
  actorId: string;
  note?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const note = params.note?.trim().slice(0, 1000) || null;
  const row = await prisma.$transaction(async (tx) => {
    const flipped = await tx.coursePaymentRequest.updateMany({
      where: { id: params.requestId, status: "confirmed", refundedAt: null },
      data: { refundedAt: now, refundedById: params.actorId, refundNote: note },
    });
    if (flipped.count === 0) {
      await failTransition(tx, params.requestId, {
        message: "Вернуть можно только подтверждённую оплату, и только один раз.",
        code: "PAYMENT_NOT_REFUNDABLE",
      });
    }
    // The access this payment opened closes with it. Points and lesson progress stay (assumption 6).
    const closed = await tx.courseAccess.updateMany({
      where: { paymentRequestId: params.requestId, revokedAt: null },
      data: { revokedAt: now, revokedById: params.actorId, revokeReason: "refund", revokeNote: note },
    });
    const loaded = await tx.coursePaymentRequest.findUniqueOrThrow({
      where: { id: params.requestId },
      include: requestInclude,
    });
    await writeAuditLog({
      client: tx,
      entityType: "course_payment_request",
      entityId: loaded.id,
      action: "update",
      actorId: params.actorId,
      payload: {
        event: "refunded",
        courseId: loaded.courseId,
        studentId: loaded.studentId,
        amountKzt: loaded.amountKzt,
        accessClosed: closed.count,
        note,
      },
    });
    return loaded;
  });

  await notifyStudentAndPayer(row, "refunded", (audience) => ({
    type: "course_access_revoked",
    title: "Оплата возвращена",
    body: `Доступ к курсу ${courseLabel(row, audience)} закрыт, оплата возвращена.`,
  }));
  return adminRequestView(row, new Map());
}

// ─── Lists for the administrator ────────────────────────────────────────────────

export interface PaymentRequestFilters {
  status?: CoursePaymentDisplayStatus;
  courseId?: string;
  /** Request date, from (a bare date is the school day). */
  from?: string;
  /** Request date, to and including (a bare date is the school day). */
  to?: string;
  /** Name or phone of the student or the payer; several words must all match. */
  search?: string;
}

function personMatches(term: string): Prisma.UserWhereInput {
  const digits = term.replace(/\D/g, "");
  return {
    OR: [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { middleName: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ],
  };
}

function buildWhere(filters: PaymentRequestFilters): Prisma.CoursePaymentRequestWhereInput {
  const and: Prisma.CoursePaymentRequestWhereInput[] = [];
  switch (filters.status) {
    case "pending":
    case "rejected":
      and.push({ status: filters.status });
      break;
    case "confirmed":
      and.push({ status: "confirmed", refundedAt: null });
      break;
    case "refunded":
      and.push({ status: "confirmed", refundedAt: { not: null } });
      break;
    default:
      break;
  }
  if (filters.courseId) and.push({ courseId: filters.courseId });
  const from = filters.from ? parsePeriodStart(filters.from) : null;
  const to = filters.to ? parsePeriodEndExclusive(filters.to) : null;
  if (from) and.push({ createdAt: { gte: from } });
  if (to) and.push({ createdAt: { lt: to } });
  const terms = (filters.search ?? "").split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 5);
  for (const term of terms) {
    and.push({ OR: [{ student: personMatches(term) }, { payer: personMatches(term) }] });
  }
  return and.length ? { AND: and } : {};
}

type CurrentAccessMap = Map<string, { expiresAt: Date; source: "payment" | "admin_grant" }>;

const accessKey = (studentId: string, courseId: string) => `${studentId}:${courseId}`;

export function adminRequestView(row: RequestRow, currentAccess: CurrentAccessMap) {
  const display = paymentDisplayStatus(row);
  const current = row.status === "pending" ? currentAccess.get(accessKey(row.studentId, row.courseId)) : undefined;
  return {
    id: row.id,
    status: row.status,
    displayStatus: display,
    amountKzt: row.amountKzt,
    currentPriceKzt: row.course.priceKzt,
    createdAt: row.createdAt,
    payerNote: row.payerNote,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy ? { id: row.decidedBy.id, name: fullName(row.decidedBy) } : null,
    decisionNote: row.decisionNote,
    refundedAt: row.refundedAt,
    refundedBy: row.refundedBy ? { id: row.refundedBy.id, name: fullName(row.refundedBy) } : null,
    refundNote: row.refundNote,
    course: { id: row.course.id, title: row.course.title },
    student: {
      id: row.student.id,
      name: fullName(row.student),
      phone: row.student.phone,
      linkedToSchool: Boolean(row.student.crmStudentId),
    },
    payer: {
      id: row.payer.id,
      name: fullName(row.payer),
      phone: row.payer.phone,
      isStudent: row.payerUserId === row.studentId,
    },
    access: row.access
      ? {
          id: row.access.id,
          startsAt: row.access.startsAt,
          expiresAt: row.access.expiresAt,
          revokedAt: row.access.revokedAt,
          revokeReason: row.access.revokeReason,
        }
      : null,
    /** A pending request for a course the student already holds: the administrator is warned (assumption 3). */
    repeatPurchase: current
      ? { currentExpiresAt: current.expiresAt, source: current.source }
      : null,
  };
}

async function loadCurrentAccess(rows: RequestRow[], now: Date): Promise<CurrentAccessMap> {
  const pending = rows.filter((row) => row.status === "pending");
  const map: CurrentAccessMap = new Map();
  if (!pending.length) return map;
  const accesses = await prisma.courseAccess.findMany({
    where: {
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { gt: now },
      OR: pending.map((row) => ({ studentId: row.studentId, courseId: row.courseId })),
    },
    select: { studentId: true, courseId: true, expiresAt: true, source: true },
  });
  for (const access of accesses) {
    const key = accessKey(access.studentId, access.courseId);
    const known = map.get(key);
    if (!known || known.expiresAt < access.expiresAt) {
      map.set(key, { expiresAt: access.expiresAt, source: access.source });
    }
  }
  return map;
}

export async function listPaymentRequests(
  filters: PaymentRequestFilters,
  page: { page: number; limit: number },
  now = new Date(),
) {
  const where = buildWhere(filters);
  // The waiting queue is served oldest first; the history, newest first.
  const order = filters.status === "pending" ? "asc" as const : "desc" as const;
  const [rows, total] = await Promise.all([
    prisma.coursePaymentRequest.findMany({
      where,
      orderBy: [{ createdAt: order }, { id: order }],
      skip: (page.page - 1) * page.limit,
      take: page.limit,
      include: requestInclude,
    }),
    prisma.coursePaymentRequest.count({ where }),
  ]);
  const currentAccess = await loadCurrentAccess(rows, now);
  return { items: rows.map((row) => adminRequestView(row, currentAccess)), total };
}

export async function getPaymentRequest(requestId: string, now = new Date()) {
  const row = await prisma.coursePaymentRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  if (!row) throw new NotFoundError("Payment request");
  return adminRequestView(row, await loadCurrentAccess([row], now));
}

/** For the badge on the menu. */
export async function countPendingPaymentRequests() {
  return prisma.coursePaymentRequest.count({ where: { status: "pending" } });
}

const EXPORT_LIMIT = 20_000;

export async function exportPaymentRequestsCsv(filters: PaymentRequestFilters) {
  const rows = await prisma.coursePaymentRequest.findMany({
    where: buildWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_LIMIT,
    include: requestInclude,
  });
  const csvRows: PaymentCsvRow[] = rows.map((row) => {
    const refundPart = row.refundedAt
      ? [formatSchoolDateTime(row.refundedAt), fullName(row.refundedBy) || null, row.refundNote]
          .filter(Boolean).join(", ")
      : "";
    return {
      createdAt: formatSchoolDateTime(row.createdAt),
      decidedAt: row.decidedAt ? formatSchoolDateTime(row.decidedAt) : "",
      studentName: fullName(row.student),
      studentPhone: row.student.phone,
      payerName: row.payerUserId === row.studentId ? fullName(row.payer) : `${fullName(row.payer)} (родитель)`,
      courseTitle: row.course.title,
      amountKzt: row.amountKzt,
      status: paymentDisplayStatus(row),
      deciderName: fullName(row.decidedBy),
      note: row.decisionNote ?? "",
      refund: refundPart,
    };
  });
  return { csv: buildPaymentsCsv(csvRows), count: csvRows.length, truncated: rows.length >= EXPORT_LIMIT };
}
