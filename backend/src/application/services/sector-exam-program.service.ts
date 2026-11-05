import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";

export const examProgramInput = z.object({
  directionId: z.string().uuid(), sectorNumber: z.number().int().min(1).max(100),
  title: z.string().trim().min(1).max(255), durationMinutes: z.number().int().min(5).max(240),
  items: z.array(z.object({ title: z.string().trim().min(1).max(255), criteria: z.string().trim().max(2000).default("") })).min(1).max(40),
});

export async function listExamPrograms() {
  return prisma.sectorExamProgram.findMany({ where: { archivedAt: null }, orderBy: [{ directionId: "asc" }, { sectorNumber: "asc" }], include: { direction: { select: { title: true } } } });
}

export async function saveExamProgram(actorUserId: string, input: z.infer<typeof examProgramInput>, id?: string, expectedRevision?: number) {
  const data = examProgramInput.parse(input);
  if (!await prisma.direction.findFirst({ where: { id: data.directionId, deletedAt: null, crmIsActive: true } })) {
    throw new BadRequestError("Направление обучения недоступно", "EXAM_PROGRAM_DIRECTION_UNAVAILABLE");
  }
  if (!id) return prisma.sectorExamProgram.create({ data: { ...data, createdById: actorUserId } });
  const changed = await prisma.sectorExamProgram.updateMany({ where: { id, revision: expectedRevision ?? -1, archivedAt: null }, data: { ...data, revision: { increment: 1 } } });
  if (!changed.count) throw new ConflictError("Программа экзамена изменилась. Обновите страницу.", "EXAM_PROGRAM_STALE");
  return prisma.sectorExamProgram.findUniqueOrThrow({ where: { id } });
}

export const examSessionInput = z.object({
  programId: z.string().uuid(), programRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(255), planIds: z.array(z.string().uuid()).min(1).max(30), requestKey: z.string().uuid(),
});

export async function createExamSession(actorUserId: string, raw: z.infer<typeof examSessionInput>) {
  const input = examSessionInput.parse(raw);
  if (new Set(input.planIds).size !== input.planIds.length) throw new BadRequestError("Ученик добавлен в экзамен дважды", "EXAM_SESSION_DUPLICATE_PLAN");
  const { requestKey, ...payload } = { ...input, planIds: [...input.planIds].sort() };
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`exam-session:${requestKey}`}))`;
      const replay = await tx.sectorExamSession.findUnique({ where: { requestKey }, include: { exams: true } });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) throw new ConflictError("Повтор запроса содержит другие условия экзамена", "EXAM_SESSION_REQUEST_CHANGED");
        return replay;
      }
      await tx.$queryRaw`SELECT id FROM sector_exam_programs WHERE id=${input.programId}::uuid FOR UPDATE`;
      const program = await tx.sectorExamProgram.findUnique({ where: { id: input.programId } });
      if (!program || program.archivedAt) throw new NotFoundError("Программа экзамена");
      if (program.revision !== input.programRevision) throw new ConflictError("Программа изменилась. Проверьте задания.", "EXAM_PROGRAM_STALE");
      const items = examProgramInput.shape.items.parse(program.items);
      const plans = [];
      const studentIds = new Set<string>();
      for (const planId of payload.planIds) {
        await tx.$queryRaw`SELECT id FROM learning_plans WHERE id=${planId}::uuid FOR UPDATE`;
        const plan = await tx.learningPlan.findUnique({ where: { id: planId }, include: { templateStep: { select: { number: true } } } });
        if (!plan || !plan.crmStudentId || plan.crmGroupId || plan.status === "closed" || !plan.examReadyAt || plan.publishedVersionNumber === null) {
          throw new ConflictError("Один из учеников ещё не готов к экзамену или уже завершил сектор", "EXAM_SESSION_STUDENT_NOT_READY");
        }
        if (plan.directionId !== program.directionId || (plan.templateStep?.number ?? plan.sequence) !== program.sectorNumber) {
          throw new BadRequestError("Программа не соответствует направлению и сектору ученика", "EXAM_SESSION_PROGRAM_MISMATCH");
        }
        if (studentIds.has(plan.crmStudentId)) throw new BadRequestError("Ученик добавлен дважды", "EXAM_SESSION_DUPLICATE_STUDENT");
        studentIds.add(plan.crmStudentId);
        plans.push(plan);
      }
      const students = await tx.user.findMany({ where: { crmStudentId: { in: [...studentIds] }, deletedAt: null, role: { slug: "student" } }, select: { crmStudentId: true, firstName: true, lastName: true, middleName: true } });
      const names = new Map(students.map(student => [student.crmStudentId, [student.lastName, student.firstName, student.middleName].filter(Boolean).join(" ")]));
      return tx.sectorExamSession.create({ data: {
        programId: program.id, programRevision: program.revision, title: input.title, requestKey, requestFingerprint: fingerprint, createdById: actorUserId,
        programSnapshot: { title: program.title, directionId: program.directionId, sectorNumber: program.sectorNumber, durationMinutes: program.durationMinutes, items },
        exams: { create: plans.map(plan => ({
          planId: plan.id, crmStudentId: plan.crmStudentId!, directionId: plan.directionId, createdById: actorUserId,
          programTitleSnapshot: program.title, studentNameSnapshot: names.get(plan.crmStudentId!) ?? null,
          items: { create: items.map((item, index) => ({ kind: "custom" as const, title: item.title, criteria: item.criteria, position: index })) },
        })) },
      }, include: { exams: true } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("У выбранного ученика уже есть открытый экзамен. Обновите список.", "SECTOR_EXAM_ALREADY_OPEN");
    throw error;
  }
}

export async function listExamSessions() {
  return prisma.sectorExamSession.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { exams: { select: { id: true, planId: true, crmStudentId: true, studentNameSnapshot: true, status: true, scheduledAt: true } } } });
}

export async function sendExamSession(sessionId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM sector_exam_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
    const session = await tx.sectorExamSession.findUnique({ where: { id: sessionId }, include: { exams: true } });
    if (!session) throw new NotFoundError("Проведение экзамена");
    if (session.exams.some(exam => exam.status === "cancelled")) throw new ConflictError("В составе есть отменённый экзамен. Проверьте участников.", "EXAM_SESSION_CANCELLED_MEMBER");
    await tx.sectorExam.updateMany({ where: { sessionId, status: "draft" }, data: { status: "awaiting_schedule", sentForScheduleAt: new Date() } });
    return tx.sectorExamSession.findUniqueOrThrow({ where: { id: sessionId }, include: { exams: true } });
  });
}
