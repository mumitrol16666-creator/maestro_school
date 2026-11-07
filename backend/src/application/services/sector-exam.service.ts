import { assertExamReadiness } from "./exam-admission.js";
import { requireCrmDirection } from "./crm-direction-projection.service.js";
import { recordCardSectorReadiness } from "./sector-readiness.service.js";
import { Prisma, type SectorExamStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { fetchTeacherStudentsForAccess } from "./teacher-substitution.service.js";
import { closeStudentSectorByExam, publicSectorExamDto } from "./learning-plan-v2.service.js";
import { fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";

/** One exam rule for every pupil: explicit program, session, confirmed readiness,
 * CRM appointment, the appointed examiner's marks and an individual result.
 * A retake is composed in the same session builder, never in a separate queue.
 */
const examInclude = {
  items: { orderBy: { position: "asc" } },
  results: true,
  session: { select: { title: true, programSnapshot: true } },
  direction: { select: { id: true, title: true, crmDirectionId: true } },
} satisfies Prisma.SectorExamInclude;

type ExamRow = Prisma.SectorExamGetPayload<{ include: typeof examInclude }>;

const sectorInclude = {
  templateStep: { select: { number: true } },
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
    ready: Boolean(plan.examReadyAt),
    readyAt: plan.examReadyAt,
    studyFinishedAt: plan.studyFinishedAt,
  };
}

function examDto(exam: ExamRow) {
  const resultByItem = new Map(exam.results.map((result) => [result.itemId, result]));
  return {
    id: exam.id,
    sessionId: exam.sessionId,
    sessionTitle: exam.session?.title ?? null,
    programTitle: exam.programTitleSnapshot,
    planId: exam.planId,
    crmStudentId: exam.crmStudentId,
    crmGroupId: exam.crmGroupId,
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

/** 07.11: the session's title, as on the exam page and in the CRM schedule; the program is a fallback. */
function examName(exam: { session?: { title?: string | null } | null; programTitleSnapshot?: string | null }) {
  return exam.session?.title || exam.programTitleSnapshot || null;
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
        select: { id: true, crmStudentId: true, firstName: true, lastName: true, middleName: true },
      })
    : [];
  return new Map(users.map((user) => [
    user.crmStudentId!,
    { userId: user.id, name: [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ") || "Ученик" },
  ]));
}

async function notifyStudentAndParents(crmStudentId: string, message: {
  title: string; body: string; dedupeKey: string; parentBody?: string; url?: string;
}) {
  try {
    const student = await prisma.user.findFirst({
      where: { crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
      select: { id: true, firstName: true },
    });
    if (!student) return;
    const { familySectorNoticeUrl, parentsSeeingPlanProgress } = await import("./parent-visibility.service.js");
    const parentIds = await parentsSeeingPlanProgress(student.id);
    const { deliverUserNotification } = await import("./notification.service.js");
    await deliverUserNotification({
      userId: student.id, type: "sector_exam_updated", title: message.title, body: message.body,
      url: message.url ?? "/monthly-plan", tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:student`,
    });
    await Promise.allSettled(parentIds.map((parentUserId) => deliverUserNotification({
      userId: parentUserId, type: "sector_exam_updated", title: message.title,
      body: message.parentBody ?? `${student.firstName ?? "Ученик"}: ${message.body}`,
      url: message.url ?? familySectorNoticeUrl(student.id), tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:parent:${parentUserId}`,
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
    where: { status: { in: ["active", "awaiting_exam"] }, crmStudentId: { not: null }, crmGroupId: null, publishedVersionNumber: { not: null } },
    include: sectorInclude,
    orderBy: [{ updatedAt: "desc" }],
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
      curriculumNumber: plan.templateStep?.number ?? plan.sequence,
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
    crmGroupId: exam.crmGroupId,
    studentName: exam.studentNameSnapshot ?? names.get(exam.crmStudentId)?.name ?? null,
    sessionId: exam.sessionId,
    sessionTitle: exam.session?.title ?? null,
    programTitle: exam.programTitleSnapshot,
    durationMinutes: exam.session?.programSnapshot && typeof exam.session.programSnapshot === "object" && !Array.isArray(exam.session.programSnapshot) ? exam.session.programSnapshot.durationMinutes : null,
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
  const teacherId = input.crmTeacherId ?? exam.crmTeacherId;
  if (!teacherId) throw new ConflictError("Назначьте принимающего преподавателя", "EXAM_EXAMINER_REQUIRED");
  assertExamReadiness(await loadSector(exam.planId),exam.crmStudentId);
  const same = exam.status === "scheduled"
    && exam.crmClassId === input.crmClassId
    && exam.scheduledAt?.getTime() === input.lessonAt.getTime()
    && exam.crmTeacherId === teacherId;
  if (same) return examDto(exam);
  await prisma.sectorExam.update({
    where: { id: examId },
    data: {
      status: "scheduled",
      crmClassId: input.crmClassId,
      scheduledAt: input.lessonAt,
      crmTeacherId: teacherId,
    },
  });
  const when = formatExamDate(input.lessonAt);
  const key = `sector-exam:${examId}:scheduled:${input.lessonAt.toISOString()}`;
  await notifyStudentAndParents(exam.crmStudentId, {
    title: examName(exam) ? `Назначен экзамен «${examName(exam)}»` : "Экзамен сектора назначен",
    url: `/exams/${exam.id}`,
    body: `${exam.direction.title}: экзамен в школе ${when}.`,
    dedupeKey: key,
  });
  // 07.11 (P3): one notice per session for the examiner, not one per pupil in it.
  await notifyTeacher(teacherId, {
    title: examName(exam) ? `Вам назначен экзамен «${examName(exam)}»` : "Вам назначен экзамен сектора",
    body: `${exam.direction.title}, ${when}.`,
    url: `/admin/exam-sessions/${exam.sessionId}`,
    dedupeKey: `sector-exam-session:${exam.sessionId ?? examId}:scheduled:${input.lessonAt.toISOString()}:teacher:${teacherId}`,
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
  // One exam lesson may hold several students' exams.
  const exams = await prisma.sectorExam.findMany({
    where: { crmClassId: input.crmClassId, status: "scheduled" },
    include: examInclude,
  });
  const results = [];
  for (const exam of exams) results.push(await applyLessonEventToExam(exam, input));
  return results.length ? results : null;
}

async function applyLessonEventToExam(exam: ExamRow, input: {
  event: "returned" | "reopened" | "cancelled" | "rescheduled";
  crmClassId: string;
  date?: string | null;
  startTime?: string | null;
  crmTeacherId?: string | null;
}) {
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
  const student = roster.students.find(student => student.crmStudentId === crmStudentId);
  if (!student) {
    throw new ForbiddenError("Ученик не закреплён за вами");
  }
  return student;
}

export async function markStudentSectorReady(teacherUserId: string, crmStudentId: string, planId: string) {
  const student = await requireTeacherStudent(teacherUserId, crmStudentId);
  const plan = await prisma.learningPlan.findFirst({ where: { id: planId, crmStudentId, crmGroupId: null }, include: { direction: true } });
  if (!plan || !plan.direction.crmDirectionId) throw new NotFoundError("Личный сектор ученика");
  await requireCrmDirection(plan.direction.crmDirectionId, student.directions);
  return recordCardSectorReadiness({ planId, crmStudentId, directionId: plan.directionId, actorUserId: teacherUserId });
}

async function requireTeacherExam(teacherUserId: string, examId: string) {
  const exam = await loadExam(examId);
  if (!exam.crmTeacherId || await requireCrmTeacherId(teacherUserId) !== exam.crmTeacherId) {
    throw new ForbiddenError("Экзамен принимает назначенный преподаватель");
  }
  return exam;
}

/** The student's open sectors with the exam for each: what the teacher may do with it now. */
export async function listTeacherStudentSectorExams(teacherUserId: string, crmStudentId: string) {
  const student = await requireTeacherStudent(teacherUserId, crmStudentId);
  const teacherId = await requireCrmTeacherId(teacherUserId);
  const plans = await prisma.learningPlan.findMany({
    where: { crmStudentId, crmGroupId: null, status: { in: ["active", "awaiting_exam"] }, publishedVersionNumber: { not: null } },
    include: sectorInclude,
    orderBy: { sequence: "desc" },
  });
  const exams = await prisma.sectorExam.findMany({
    where: { planId: { in: plans.map((plan) => plan.id) }, status: { not: "cancelled" } },
    include: examInclude,
    orderBy: [{ attempt: "desc" }, { createdAt: "desc" }],
  });
  return Promise.all(plans.map(async (plan) => {
    const progress = sectorProgress(plan);
    const planExams = exams.filter((exam) => exam.planId === plan.id);
    const exam = planExams[0] ?? null;
    const previous = exam?.previousExamId ? planExams.find((item) => item.id === exam.previousExamId) ?? null : null;
    let canMarkReady = false;
    if (!progress.ready && plan.direction.crmDirectionId) {
      try { await requireCrmDirection(plan.direction.crmDirectionId, student.directions); canMarkReady = true; }
      catch (error) { if (!(error instanceof BadRequestError || error instanceof ConflictError)) throw error; }
    }
    return {
      planId: plan.id,
      sequence: plan.templateStep?.number ?? plan.sequence,
      direction: plan.direction,
      progress,
      exam: exam && exam.status !== "draft" ? examDto(exam) : null,
      previousExam: previous ? examDto(previous) : null,
      canMarkReady,
      canStart: Boolean(exam && exam.crmTeacherId === teacherId && exam.status === "scheduled" && progress.ready),
    };
  }));
}

export async function startSectorExam(teacherUserId: string, examId: string, now = new Date()) {
  const exam = await requireTeacherExam(teacherUserId, examId);
  if (exam.status === "in_progress") return examDto(exam);
  if (exam.status !== "scheduled") {
    throw new ConflictError("Экзамен ещё не назначен в расписании", "SECTOR_EXAM_NOT_SCHEDULED");
  }
  const plan = await loadSector(exam.planId);
  assertExamReadiness(plan,exam.crmStudentId);
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
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM sector_exams WHERE id=${examId}::uuid FOR UPDATE`;
    const current = await tx.sectorExam.findUniqueOrThrow({where:{id:examId}});
    if (current.status !== "in_progress") throw new ConflictError("Экзамен уже завершён", "SECTOR_EXAM_NOT_IN_PROGRESS");
    await tx.sectorExamResult.upsert({
      where: { itemId_crmStudentId: { itemId, crmStudentId: exam.crmStudentId } },
      create: { examId, itemId, crmStudentId: exam.crmStudentId, done, markedById: teacherUserId },
      update: { done, markedById: teacherUserId, markedAt: new Date() },
    });
  });
  return examDto(await loadExam(examId));
}

function certificateNumber(examId: string, at: Date) {
  return `MS-${at.getUTCFullYear()}-${examId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Save the result atomically with sector completion and its one-time award. */
export async function finishSectorExam(teacherUserId: string, examId: string, input: {
  decision: "pass" | "retake";
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
  if (!passed && input.decision !== "retake") {
    throw new BadRequestError("Для сдачи выполните все пункты экзамена. Иначе выберите пересдачу.", "SECTOR_EXAM_NOT_PASSED");
  }
  let certificateSnapshot: Prisma.InputJsonValue | undefined;
  if (passed && input.decision !== "retake") {
    let studentName = exam.studentNameSnapshot ?? (await studentNames([exam.crmStudentId])).get(exam.crmStudentId)?.name;
    if (!studentName) {
      const summary = await fetchStudentOfflineSummary(exam.crmStudentId);
      const profile = summary.profile as { name?: unknown } | undefined;
      studentName = typeof profile?.name === "string" ? profile.name.trim() : undefined;
    }
    if (!studentName) throw new BadRequestError("Проверьте имя ученика перед выдачей сертификата", "CERTIFICATE_STUDENT_NAME_REQUIRED");
    const [plan, examiner] = await Promise.all([
      loadSector(exam.planId), prisma.user.findUnique({ where: { id: teacherUserId }, select: { firstName: true, lastName: true, middleName: true } }),
    ]);
    certificateSnapshot = {
      studentName, direction: exam.direction.title, sectorNumber: plan.templateStep?.number ?? plan.sequence,
      programTitle: exam.programTitleSnapshot ?? `Сектор ${plan.templateStep?.number ?? plan.sequence}`,
      examinerName: examiner ? [examiner.lastName, examiner.firstName, examiner.middleName].filter(Boolean).join(" ") : "",
      issuedAt: now.toISOString(), examAt: (exam.scheduledAt ?? now).toISOString(),
    };
  }
  const completion = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM sector_exams WHERE id=${examId}::uuid FOR UPDATE`;
    const current = await tx.sectorExam.findUniqueOrThrow({where:{id:examId},include:examInclude});
    if (current.status === "completed") {
      if (current.decision !== input.decision) throw new ConflictError("Экзамен завершён с другим решением", "SECTOR_EXAM_ALREADY_FINISHED");
      return {retakeExamId:null,awardedPoints:0,replayed:true};
    }
    if (current.status !== "in_progress") throw new ConflictError("Экзамен ещё не начат", "SECTOR_EXAM_NOT_IN_PROGRESS");
    if (current.results.length !== exam.results.length || current.results.some(result => marks.get(result.itemId) !== result.done)) {
      throw new ConflictError("Отметки экзамена изменились. Проверьте результат ещё раз.", "SECTOR_EXAM_RESULTS_CHANGED");
    }
    await tx.sectorExam.updateMany({
    where: { id: examId, status: "in_progress" },
    data: {
      status: "completed",
      finishedAt: now,
      finishedById: teacherUserId,
      outcome,
      decision: input.decision,
      comment: input.comment?.trim().slice(0, 2000) || null,
      certificateSnapshot,
      certificateNumber: passed && input.decision !== "retake" ? certificateNumber(examId, now) : null,
      certificateIssuedAt: passed && input.decision !== "retake" ? now : null,
    },
  });

  let awardedPoints = 0;
  if (input.decision === "pass") {
    const closed = await closeStudentSectorByExam(exam.planId, { now, tx });
    awardedPoints = closed.awardedPoints;
  }
  // No automatic second exam. The pupil is selectable in the ordinary builder again.
  const retakeExamId = null;

    return {retakeExamId,awardedPoints,replayed:false};
  });
  const {retakeExamId,awardedPoints} = completion;
  if (completion.replayed) return {exam:examDto(await loadExam(examId)),retakeExamId,awardedPoints};

  const summary = `${doneCount} из ${exam.items.length} пунктов`;
  await notifyStudentAndParents(exam.crmStudentId, input.decision !== "retake"
    ? {
        title: passed ? "Экзамен сдан, сектор закрыт" : "Сектор закрыт после экзамена",
        body: `${exam.direction.title}: ${summary}.${passed ? " Выдан сертификат." : ""}${awardedPoints ? ` Начислено ${awardedPoints} баллов.` : ""}`,
        url: `/exams/${examId}`,
        dedupeKey: `sector-exam:${examId}:finished`,
      }
    : {
        title: "Нужна пересдача экзамена",
        body: `${exam.direction.title}: ${summary}. Школа назначит новую дату.`,
        url: `/exams/${examId}`,
        dedupeKey: `sector-exam:${examId}:finished`,
      });
  return { exam: examDto(await loadExam(examId)), retakeExamId, awardedPoints };
}

export { publicSectorExamDto };


/** One examination event: the program's saved checklist and each participant's result. */
export async function getExamSessionWorkspace(actorUserId: string, sessionId: string) {
  const actor = await prisma.user.findFirst({ where: { id: actorUserId, isActive: true, deletedAt: null }, include: { role: true } });
  if (!actor) throw new ForbiddenError();
  const coordinator = ["admin", "owner", "super_admin", "curator", "branch_manager"].includes(actor.role.slug);
  if (!coordinator && (actor.role.slug !== "teacher" || !actor.crmTeacherId)) throw new ForbiddenError();
  const session = await prisma.sectorExamSession.findUnique({ where: { id: sessionId },
    include: { exams: { where: { status: { not: "cancelled" } }, include: { ...examInclude,
      plan: { select: { examReadyAt: true, status: true } } }, orderBy: { studentNameSnapshot: "asc" } } } });
  if (!session) throw new NotFoundError("Проведение экзамена");
  const exams = [];
  for (const exam of session.exams) {
    let canConduct = false;
    if (actor.role.slug === "teacher") {
      try { await requireTeacherExam(actorUserId, exam.id); canConduct = true; }
      catch (error) { if (error instanceof ForbiddenError) continue; throw error; }
    }
    exams.push({ studentName: exam.studentNameSnapshot || exam.crmStudentId,
      ready: Boolean(exam.plan.examReadyAt), canConduct,
      canStart: canConduct && exam.status === "scheduled" && Boolean(exam.plan.examReadyAt),
      exam: examDto(exam) });
  }
  if (!coordinator && !exams.length) throw new ForbiddenError("Вы не назначены принимать этот экзамен");
  return { id: session.id, title: session.title, program: session.programSnapshot, participants: exams };
}


export async function listExamSessionsForLesson(actorUserId:string,crmClassId:string) {
  const teacherId=await requireCrmTeacherId(actorUserId);
  const sessions=await prisma.sectorExamSession.findMany({where:{exams:{some:{crmClassId,crmTeacherId:teacherId,status:{not:"cancelled"}}}},select:{id:true,title:true}});
  return sessions;
}

/** The pupil sees the assigned exam itself, without access to the other participants. */
export async function getPersonalExam(actorUserId:string,examId:string) {
  const actor=await prisma.user.findFirst({where:{id:actorUserId,isActive:true,deletedAt:null},include:{role:{select:{slug:true}}}});
  if(!actor) throw new ForbiddenError();
  const exam=await loadExam(examId);
  if(["draft","awaiting_schedule","cancelled"].includes(exam.status)) throw new NotFoundError("Экзамен ещё не назначен");
  const role=actor.role.slug;
  if(role==="student") {
    if(!actor.crmStudentId || actor.crmStudentId!==exam.crmStudentId) throw new NotFoundError("Экзамен");
  } else if(role==="parent") {
    const link=await prisma.parentStudentLink.findFirst({where:{parentUserId:actor.id,isActive:true,
      student:{crmStudentId:exam.crmStudentId,isActive:true,deletedAt:null,role:{slug:"student"}}},select:{studentUserId:true}});
    if(!link) throw new NotFoundError("Экзамен");
    const {getParentVisibility}=await import("./parent-visibility.service.js");
    if(!(await getParentVisibility(link.studentUserId)).showPlanProgress) throw new ForbiddenError("Учебные результаты скрыты настройками семейного доступа");
  } else if(role==="teacher") {
    if (!(exam.status==="completed" && exam.finishedById===actorUserId)) {
      try { await requireTeacherExam(actorUserId,examId); }
      catch(error) { if (!(error instanceof ForbiddenError)) throw error; await requireTeacherStudent(actorUserId,exam.crmStudentId); }
    }
  }
  else if(!["admin","owner","super_admin","curator","branch_manager"].includes(role)) throw new ForbiddenError();
  return {studentName:exam.studentNameSnapshot??null,exam:examDto(exam)};
}
