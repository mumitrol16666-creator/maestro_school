import { randomUUID } from "node:crypto";
import { Prisma, type SectorExamStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { fetchTeacherStudentsForAccess } from "./teacher-substitution.service.js";
import { closeStudentSectorByExam, publicSectorExamDto } from "./learning-plan-v2.service.js";

/**
 * Plan 1.10: the sector exam. It is held live at the school as a free extra lesson. The platform
 * keeps what is checked (a list built from the sector's topics plus the admin's own points), the
 * date CRM schedules it for, the teacher's "done / not done" marks and the outcome.
 *
 * draft → awaiting_schedule (admin sends it to CRM) → scheduled (CRM booked the lesson)
 *       → in_progress (teacher starts it once every topic is at 100 %) → completed.
 * Finishing either closes the sector (250 Points, certificate when every point is done) or
 * opens a retake: a new exam with the same points, linked to this one, back in the CRM queue.
 */

export const SECTOR_EXAM_MAX_ITEMS = 40;
const OPEN_STATUSES: SectorExamStatus[] = ["draft", "awaiting_schedule", "scheduled", "in_progress"];

export type SectorExamItemInput = {
  kind: "topic" | "custom";
  topicId?: string | null;
  title: string;
  criteria?: string | null;
};

const examInclude = {
  items: { orderBy: { position: "asc" } },
  results: true,
  direction: { select: { id: true, title: true, crmDirectionId: true } },
} satisfies Prisma.SectorExamInclude;

type ExamRow = Prisma.SectorExamGetPayload<{ include: typeof examInclude }>;

const sectorInclude = {
  direction: { select: { id: true, title: true, crmDirectionId: true } },
  versions: {
    include: {
      topics: {
        include: { topic: { select: { id: true, progressPercent: true, archivedAt: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
} satisfies Prisma.LearningPlanInclude;

type SectorRow = Prisma.LearningPlanGetPayload<{ include: typeof sectorInclude }>;

function sectorTopics(plan: SectorRow) {
  const version = plan.versions.find((item) => item.version === plan.publishedVersionNumber);
  return (version?.topics ?? []).filter((link) => link.state === "active" && !link.topic.archivedAt);
}

function sectorProgress(plan: SectorRow) {
  const topics = sectorTopics(plan);
  const completed = topics.filter((link) => link.topic.progressPercent === 100).length;
  return {
    completed,
    total: topics.length,
    percent: topics.length ? Math.round((completed / topics.length) * 100) : 0,
    ready: topics.length > 0 && completed === topics.length,
  };
}

function examDto(exam: ExamRow) {
  const resultByItem = new Map(exam.results.map((result) => [result.itemId, result]));
  return {
    id: exam.id,
    planId: exam.planId,
    crmStudentId: exam.crmStudentId,
    direction: exam.direction,
    status: exam.status,
    attempt: exam.attempt,
    previousExamId: exam.previousExamId,
    sentForScheduleAt: exam.sentForScheduleAt,
    crmClassId: exam.crmClassId,
    scheduledAt: exam.scheduledAt,
    startedAt: exam.startedAt,
    finishedAt: exam.finishedAt,
    outcome: exam.outcome,
    decision: exam.decision,
    comment: exam.comment,
    certificate: exam.certificateNumber
      ? { number: exam.certificateNumber, issuedAt: exam.certificateIssuedAt }
      : null,
    cancelledAt: exam.cancelledAt,
    cancelReason: exam.cancelReason,
    items: exam.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      topicId: item.topicId,
      title: item.title,
      criteria: item.criteria,
      position: item.position,
      done: resultByItem.get(item.id)?.done ?? null,
    })),
  };
}

async function loadExam(examId: string) {
  const exam = await prisma.sectorExam.findUnique({ where: { id: examId }, include: examInclude });
  if (!exam) throw new NotFoundError("Экзамен");
  return exam;
}

async function loadSector(planId: string) {
  const plan = await prisma.learningPlan.findUnique({ where: { id: planId }, include: sectorInclude });
  if (!plan) throw new NotFoundError("Сектор");
  return plan;
}

async function studentNames(crmStudentIds: string[]) {
  const users = crmStudentIds.length
    ? await prisma.user.findMany({
        where: { crmStudentId: { in: crmStudentIds }, deletedAt: null, role: { slug: "student" } },
        select: { id: true, crmStudentId: true, firstName: true, lastName: true },
      })
    : [];
  return new Map(users.map((user) => [
    user.crmStudentId!,
    { userId: user.id, name: [user.lastName, user.firstName].filter(Boolean).join(" ") || "Ученик" },
  ]));
}

function normalizeItems(plan: SectorRow, items: SectorExamItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestError("В экзамене должен быть хотя бы один пункт", "SECTOR_EXAM_ITEMS_REQUIRED");
  }
  if (items.length > SECTOR_EXAM_MAX_ITEMS) {
    throw new BadRequestError(`Не больше ${SECTOR_EXAM_MAX_ITEMS} пунктов в экзамене`, "SECTOR_EXAM_TOO_MANY_ITEMS");
  }
  const topicIds = new Set(sectorTopics(plan).map((link) => link.topicId));
  const seenTopics = new Set<string>();
  return items.map((item, index) => {
    const title = item.title?.trim() ?? "";
    if (!title || title.length > 255) {
      throw new BadRequestError("У пункта экзамена должно быть название до 255 символов", "SECTOR_EXAM_ITEM_TITLE_INVALID");
    }
    const criteria = (item.criteria ?? "").trim().slice(0, 2000);
    if (item.kind === "topic") {
      if (!item.topicId || !topicIds.has(item.topicId)) {
        throw new BadRequestError("Тема пункта не входит в этот сектор", "SECTOR_EXAM_TOPIC_NOT_IN_SECTOR");
      }
      if (seenTopics.has(item.topicId)) {
        throw new BadRequestError("Тема повторяется в экзамене", "SECTOR_EXAM_TOPIC_DUPLICATE");
      }
      seenTopics.add(item.topicId);
      return { kind: "topic" as const, topicId: item.topicId, title, criteria, position: index };
    }
    return { kind: "custom" as const, topicId: null, title, criteria, position: index };
  });
}

function requireIndividualPublished(plan: SectorRow) {
  if (!plan.crmStudentId) {
    throw new BadRequestError("Экзамен для групповых секторов появится позже", "SECTOR_EXAM_GROUP_NOT_SUPPORTED");
  }
  if (plan.status !== "active") {
    throw new ConflictError("Сектор уже закрыт", "SECTOR_ALREADY_CLOSED");
  }
  if (plan.publishedVersionNumber === null) {
    throw new BadRequestError("Сектор ещё не опубликован ученику", "SECTOR_NOT_PUBLISHED");
  }
}

function openExamConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictError("У этого сектора уже есть открытый экзамен", "SECTOR_EXAM_ALREADY_OPEN");
  }
  throw error;
}

/* ─── Notifications ─────────────────────────────────────────────────── */

async function notifyStudentAndParents(crmStudentId: string, message: {
  title: string; body: string; dedupeKey: string; parentBody?: string;
}) {
  try {
    const student = await prisma.user.findFirst({
      where: { crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
      select: { id: true, firstName: true },
    });
    if (!student) return;
    const parents = await prisma.parentStudentLink.findMany({
      where: { studentUserId: student.id, isActive: true, revokedAt: null },
      select: { parentUserId: true },
    });
    const { deliverUserNotification } = await import("./notification.service.js");
    await deliverUserNotification({
      userId: student.id, type: "sector_exam_updated", title: message.title, body: message.body,
      url: "/monthly-plan", tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:student`,
    });
    await Promise.allSettled(parents.map((link) => deliverUserNotification({
      userId: link.parentUserId, type: "sector_exam_updated", title: message.title,
      body: message.parentBody ?? `${student.firstName ?? "Ученик"}: ${message.body}`,
      url: "/family", tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:parent:${link.parentUserId}`,
    })));
  } catch {
    // The exam state is saved even when delivery is temporarily unavailable.
  }
}

async function notifyTeacher(crmTeacherId: string | null, message: { title: string; body: string; url: string; dedupeKey: string }) {
  if (!crmTeacherId) return;
  try {
    const teacher = await prisma.user.findFirst({
      where: { crmTeacherId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!teacher) return;
    const { deliverUserNotification } = await import("./notification.service.js");
    await deliverUserNotification({
      userId: teacher.id, type: "sector_exam_updated", title: message.title, body: message.body,
      url: message.url, tag: message.dedupeKey, dedupeKey: message.dedupeKey,
    });
  } catch {
    // See notifyStudentAndParents.
  }
}

function formatExamDate(value: Date) {
  return value.toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe",
  });
}

/* ─── Admin ─────────────────────────────────────────────────────────── */

/** Every open individual sector with its progress and the exam prepared for it. */
export async function listAdminSectorExamBoard() {
  const plans = await prisma.learningPlan.findMany({
    where: { status: "active", crmStudentId: { not: null }, crmGroupId: null, publishedVersionNumber: { not: null } },
    include: sectorInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });
  const exams = await prisma.sectorExam.findMany({
    where: { planId: { in: plans.map((plan) => plan.id) }, status: { not: "cancelled" } },
    include: examInclude,
    orderBy: [{ attempt: "desc" }, { createdAt: "desc" }],
  });
  const examByPlan = new Map<string, ExamRow>();
  for (const exam of exams) if (!examByPlan.has(exam.planId)) examByPlan.set(exam.planId, exam);
  const names = await studentNames(plans.map((plan) => plan.crmStudentId!));
  const sectors = plans.map((plan) => {
    const progress = sectorProgress(plan);
    const exam = examByPlan.get(plan.id) ?? null;
    return {
      planId: plan.id,
      sequence: plan.sequence,
      crmStudentId: plan.crmStudentId!,
      studentName: names.get(plan.crmStudentId!)?.name ?? plan.crmStudentId!,
      direction: plan.direction,
      goal: plan.versions.find((item) => item.version === plan.publishedVersionNumber)?.goal ?? "",
      progress,
      exam: exam ? examDto(exam) : null,
    };
  });
  // Sectors ready for an exam and exams waiting on someone come first.
  const weight = (item: (typeof sectors)[number]) => {
    if (item.exam?.status === "in_progress" || item.exam?.status === "scheduled") return 1;
    if (item.exam?.status === "awaiting_schedule") return 2;
    if (item.progress.ready && (!item.exam || item.exam.status === "completed")) return 0;
    if (item.exam?.status === "draft") return 3;
    return 4;
  };
  sectors.sort((left, right) => weight(left) - weight(right) || right.progress.percent - left.progress.percent);
  return { generatedAt: new Date().toISOString(), sectors };
}

/** The checklist an exam starts from: one point per topic of the sector with its mastery criteria. */
export async function sectorExamTemplate(planId: string) {
  const plan = await loadSector(planId);
  requireIndividualPublished(plan);
  return {
    planId: plan.id,
    items: sectorTopics(plan).map((link) => ({
      kind: "topic" as const,
      topicId: link.topicId,
      title: link.titleSnapshot.slice(0, 255),
      criteria: link.masteryCriteriaSnapshot ?? "",
    })),
  };
}

export async function createSectorExam(adminUserId: string, input: {
  planId: string;
  items: SectorExamItemInput[];
  send?: boolean;
  now?: Date;
}) {
  const plan = await loadSector(input.planId);
  requireIndividualPublished(plan);
  const items = normalizeItems(plan, input.items);
  const now = input.now ?? new Date();
  const exam = await prisma.sectorExam.create({
    data: {
      id: randomUUID(),
      planId: plan.id,
      crmStudentId: plan.crmStudentId!,
      directionId: plan.directionId,
      status: input.send ? "awaiting_schedule" : "draft",
      sentForScheduleAt: input.send ? now : null,
      createdById: adminUserId,
      items: { create: items },
    },
    include: examInclude,
  }).catch(openExamConflict);
  return examDto(exam);
}

export async function updateSectorExamItems(examId: string, items: SectorExamItemInput[]) {
  const exam = await loadExam(examId);
  if (exam.status !== "draft" && exam.status !== "awaiting_schedule") {
    throw new ConflictError("Пункты можно менять, пока экзамен не назначен", "SECTOR_EXAM_LOCKED");
  }
  const plan = await loadSector(exam.planId);
  const normalized = normalizeItems(plan, items);
  await prisma.$transaction([
    prisma.sectorExamItem.deleteMany({ where: { examId } }),
    prisma.sectorExam.update({ where: { id: examId }, data: { items: { create: normalized } } }),
  ]);
  return examDto(await loadExam(examId));
}

export async function sendSectorExamForSchedule(examId: string, now = new Date()) {
  const updated = await prisma.sectorExam.updateMany({
    where: { id: examId, status: "draft" },
    data: { status: "awaiting_schedule", sentForScheduleAt: now },
  });
  const exam = await loadExam(examId);
  if (!updated.count && exam.status !== "awaiting_schedule") {
    throw new ConflictError("Экзамен уже не черновик", "SECTOR_EXAM_NOT_DRAFT");
  }
  return examDto(exam);
}

export async function cancelSectorExam(examId: string, reason: string | null, now = new Date()) {
  const updated = await prisma.sectorExam.updateMany({
    where: { id: examId, status: { in: ["draft", "awaiting_schedule", "scheduled"] } },
    data: { status: "cancelled", cancelledAt: now, cancelReason: reason?.trim().slice(0, 255) || "Отменён администратором" },
  });
  const exam = await loadExam(examId);
  if (!updated.count && exam.status !== "cancelled") {
    throw new ConflictError("Начатый или завершённый экзамен отменить нельзя", "SECTOR_EXAM_NOT_CANCELLABLE");
  }
  return examDto(exam);
}

/* ─── CRM (plan 1.11 builds the screens; the platform side lives here) ─ */

/** Exams waiting for CRM to book a lesson, oldest first. */
export async function listSectorExamsAwaitingSchedule() {
  const exams = await prisma.sectorExam.findMany({
    where: { status: "awaiting_schedule" },
    include: examInclude,
    orderBy: [{ sentForScheduleAt: "asc" }, { createdAt: "asc" }],
  });
  const names = await studentNames(exams.map((exam) => exam.crmStudentId));
  const plans = await prisma.learningPlan.findMany({
    where: { id: { in: exams.map((exam) => exam.planId) } },
    select: { id: true, sequence: true },
  });
  const sequenceByPlan = new Map(plans.map((plan) => [plan.id, plan.sequence]));
  return exams.map((exam) => ({
    examId: exam.id,
    crmStudentId: exam.crmStudentId,
    studentName: names.get(exam.crmStudentId)?.name ?? null,
    crmDirectionId: exam.direction.crmDirectionId,
    directionTitle: exam.direction.title,
    sectorSequence: sequenceByPlan.get(exam.planId) ?? null,
    attempt: exam.attempt,
    itemsCount: exam.items.length,
    sentForScheduleAt: exam.sentForScheduleAt,
  }));
}

/** CRM booked (or moved) the exam lesson. Repeating the same booking changes nothing. */
export async function scheduleSectorExamFromCrm(examId: string, input: {
  crmClassId: string;
  lessonAt: Date;
  crmTeacherId?: string | null;
}) {
  const exam = await loadExam(examId);
  if (exam.status !== "awaiting_schedule" && exam.status !== "scheduled") {
    throw new ConflictError("Экзамен нельзя назначить в текущем состоянии", "SECTOR_EXAM_NOT_SCHEDULABLE");
  }
  const same = exam.status === "scheduled"
    && exam.crmClassId === input.crmClassId
    && exam.scheduledAt?.getTime() === input.lessonAt.getTime()
    && (exam.crmTeacherId ?? null) === (input.crmTeacherId ?? null);
  if (same) return examDto(exam);
  await prisma.sectorExam.update({
    where: { id: examId },
    data: {
      status: "scheduled",
      crmClassId: input.crmClassId,
      scheduledAt: input.lessonAt,
      crmTeacherId: input.crmTeacherId ?? null,
    },
  });
  const when = formatExamDate(input.lessonAt);
  const key = `sector-exam:${examId}:scheduled:${input.lessonAt.toISOString()}`;
  await notifyStudentAndParents(exam.crmStudentId, {
    title: "Экзамен сектора назначен",
    body: `${exam.direction.title}: экзамен в школе ${when}.`,
    dedupeKey: key,
  });
  await notifyTeacher(input.crmTeacherId ?? null, {
    title: "Вам назначен экзамен сектора",
    body: `${exam.direction.title}, ${when}.`,
    url: `/admin/my-students/student/${encodeURIComponent(exam.crmStudentId)}`,
    dedupeKey: `${key}:teacher`,
  });
  return examDto(await loadExam(examId));
}

/** CRM sends dates as dd.mm.yyyy (or ISO) and a local Aqtobe time. */
function crmLessonInstant(date: string | null | undefined, startTime: string | null | undefined) {
  if (!date || !startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) return null;
  const ru = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso = ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const value = new Date(`${iso}T${startTime.padStart(5, "0")}:00+05:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Plan 1.11: the exam lesson changes in CRM. A cancelled lesson puts the exam back in the
 * CRM queue; a moved lesson moves the exam date. An exam already started is left alone.
 */
export async function applyCrmLessonEventToSectorExams(input: {
  event: "returned" | "reopened" | "cancelled" | "rescheduled";
  crmClassId: string;
  date?: string | null;
  startTime?: string | null;
  crmTeacherId?: string | null;
}) {
  if (input.event !== "cancelled" && input.event !== "rescheduled") return null;
  const exam = await prisma.sectorExam.findFirst({
    where: { crmClassId: input.crmClassId, status: "scheduled" },
    include: examInclude,
  });
  if (!exam) return null;
  if (input.event === "cancelled") {
    await prisma.sectorExam.update({
      where: { id: exam.id },
      data: { status: "awaiting_schedule", crmClassId: null, scheduledAt: null, crmTeacherId: null, sentForScheduleAt: new Date() },
    });
    await notifyStudentAndParents(exam.crmStudentId, {
      title: "Урок экзамена отменён",
      body: `${exam.direction.title}: школа назначит новую дату экзамена.`,
      dedupeKey: `sector-exam:${exam.id}:cancelled:${input.crmClassId}`,
    });
    return { examId: exam.id, status: "awaiting_schedule" as const };
  }
  const lessonAt = crmLessonInstant(input.date, input.startTime);
  if (!lessonAt) return null;
  return scheduleSectorExamFromCrm(exam.id, {
    crmClassId: input.crmClassId,
    lessonAt,
    crmTeacherId: input.crmTeacherId ?? exam.crmTeacherId,
  });
}

/* ─── Teacher ───────────────────────────────────────────────────────── */

async function requireTeacherStudent(teacherUserId: string, crmStudentId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherStudentsForAccess(crmTeacherId, { need: crmStudentId });
  if (!roster.students.some((student) => student.crmStudentId === crmStudentId)) {
    throw new ForbiddenError("Ученик не закреплён за вами");
  }
}

async function requireTeacherExam(teacherUserId: string, examId: string) {
  const exam = await loadExam(examId);
  await requireTeacherStudent(teacherUserId, exam.crmStudentId);
  return exam;
}

/** The student's open sectors with the exam for each: what the teacher may do with it now. */
export async function listTeacherStudentSectorExams(teacherUserId: string, crmStudentId: string) {
  await requireTeacherStudent(teacherUserId, crmStudentId);
  const plans = await prisma.learningPlan.findMany({
    where: { crmStudentId, crmGroupId: null, status: "active", publishedVersionNumber: { not: null } },
    include: sectorInclude,
    orderBy: { sequence: "desc" },
  });
  const exams = await prisma.sectorExam.findMany({
    where: { planId: { in: plans.map((plan) => plan.id) }, status: { not: "cancelled" } },
    include: examInclude,
    orderBy: [{ attempt: "desc" }, { createdAt: "desc" }],
  });
  return plans.map((plan) => {
    const progress = sectorProgress(plan);
    const planExams = exams.filter((exam) => exam.planId === plan.id);
    const exam = planExams[0] ?? null;
    const previous = exam?.previousExamId ? planExams.find((item) => item.id === exam.previousExamId) ?? null : null;
    return {
      planId: plan.id,
      sequence: plan.sequence,
      direction: plan.direction,
      progress,
      exam: exam && exam.status !== "draft" ? examDto(exam) : null,
      previousExam: previous ? examDto(previous) : null,
      canStart: Boolean(exam && exam.status === "scheduled" && progress.ready),
    };
  });
}

export async function startSectorExam(teacherUserId: string, examId: string, now = new Date()) {
  const exam = await requireTeacherExam(teacherUserId, examId);
  if (exam.status === "in_progress") return examDto(exam);
  if (exam.status !== "scheduled") {
    throw new ConflictError("Экзамен ещё не назначен в расписании", "SECTOR_EXAM_NOT_SCHEDULED");
  }
  const plan = await loadSector(exam.planId);
  if (plan.status !== "active") throw new ConflictError("Сектор уже закрыт", "SECTOR_ALREADY_CLOSED");
  if (!sectorProgress(plan).ready) {
    throw new ConflictError("Начать экзамен можно, когда все темы сектора на 100 %", "SECTOR_EXAM_TOPICS_INCOMPLETE");
  }
  await prisma.sectorExam.updateMany({
    where: { id: examId, status: "scheduled" },
    data: { status: "in_progress", startedAt: now, startedById: teacherUserId },
  });
  return examDto(await loadExam(examId));
}

export async function markSectorExamItem(teacherUserId: string, examId: string, itemId: string, done: boolean) {
  const exam = await requireTeacherExam(teacherUserId, examId);
  if (exam.status !== "in_progress") {
    throw new ConflictError("Отмечать пункты можно только во время экзамена", "SECTOR_EXAM_NOT_IN_PROGRESS");
  }
  if (!exam.items.some((item) => item.id === itemId)) throw new NotFoundError("Пункт экзамена");
  await prisma.sectorExamResult.upsert({
    where: { itemId_crmStudentId: { itemId, crmStudentId: exam.crmStudentId } },
    create: { examId, itemId, crmStudentId: exam.crmStudentId, done, markedById: teacherUserId },
    update: { done, markedById: teacherUserId, markedAt: new Date() },
  });
  return examDto(await loadExam(examId));
}

function certificateNumber(examId: string, at: Date) {
  return `MS-${at.getUTCFullYear()}-${examId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Ends the exam with the teacher's decision. Every point must be marked. "close_sector" closes
 * the sector whatever the outcome (250 Points; a certificate only when every point is done);
 * "retake" leaves the sector open and puts a new exam with the same points in the CRM queue.
 * Repeating the same decision returns the saved result.
 */
export async function finishSectorExam(teacherUserId: string, examId: string, input: {
  decision: "close_sector" | "retake";
  comment?: string | null;
  now?: Date;
}) {
  const exam = await requireTeacherExam(teacherUserId, examId);
  if (exam.status === "completed") {
    if (exam.decision === input.decision) return { exam: examDto(exam), retakeExamId: null, awardedPoints: 0 };
    throw new ConflictError("Экзамен уже завершён с другим решением", "SECTOR_EXAM_ALREADY_FINISHED");
  }
  if (exam.status !== "in_progress") {
    throw new ConflictError("Экзамен ещё не начат", "SECTOR_EXAM_NOT_IN_PROGRESS");
  }
  const marks = new Map(exam.results.map((result) => [result.itemId, result.done]));
  if (exam.items.some((item) => !marks.has(item.id))) {
    throw new BadRequestError("Отметьте каждый пункт: сделано или не сделано", "SECTOR_EXAM_ITEMS_UNMARKED");
  }
  const doneCount = exam.items.filter((item) => marks.get(item.id)).length;
  const outcome = doneCount === exam.items.length ? "passed" : doneCount === 0 ? "failed" : "partial";
  const now = input.now ?? new Date();
  const passed = outcome === "passed";
  const finished = await prisma.sectorExam.updateMany({
    where: { id: examId, status: "in_progress" },
    data: {
      status: "completed",
      finishedAt: now,
      finishedById: teacherUserId,
      outcome,
      decision: input.decision,
      comment: input.comment?.trim().slice(0, 2000) || null,
      certificateNumber: passed && input.decision === "close_sector" ? certificateNumber(examId, now) : null,
      certificateIssuedAt: passed && input.decision === "close_sector" ? now : null,
    },
  });
  if (!finished.count) return { exam: examDto(await loadExam(examId)), retakeExamId: null, awardedPoints: 0 };

  let retakeExamId: string | null = null;
  let awardedPoints = 0;
  if (input.decision === "close_sector") {
    const closed = await closeStudentSectorByExam(exam.planId, { now });
    awardedPoints = closed.awardedPoints;
  } else {
    retakeExamId = randomUUID();
    await prisma.sectorExam.create({
      data: {
        id: retakeExamId,
        planId: exam.planId,
        crmStudentId: exam.crmStudentId,
        directionId: exam.directionId,
        status: "awaiting_schedule",
        attempt: exam.attempt + 1,
        previousExamId: exam.id,
        sentForScheduleAt: now,
        createdById: teacherUserId,
        items: {
          create: exam.items.map((item) => ({
            kind: item.kind, topicId: item.topicId, title: item.title, criteria: item.criteria, position: item.position,
          })),
        },
      },
    }).catch(openExamConflict);
  }

  const summary = `${doneCount} из ${exam.items.length} пунктов`;
  await notifyStudentAndParents(exam.crmStudentId, input.decision === "close_sector"
    ? {
        title: passed ? "Экзамен сдан, сектор закрыт" : "Сектор закрыт после экзамена",
        body: `${exam.direction.title}: ${summary}.${passed ? " Выдан сертификат." : ""}${awardedPoints ? ` Начислено ${awardedPoints} баллов.` : ""}`,
        dedupeKey: `sector-exam:${examId}:finished`,
      }
    : {
        title: "Нужна пересдача экзамена",
        body: `${exam.direction.title}: ${summary}. Школа назначит новую дату.`,
        dedupeKey: `sector-exam:${examId}:finished`,
      });
  return { exam: examDto(await loadExam(examId)), retakeExamId, awardedPoints };
}

export { publicSectorExamDto };
