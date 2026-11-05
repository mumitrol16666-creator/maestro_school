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
        if (!plan || !plan.crmStudentId || plan.crmGroupId || plan.status === "closed" || plan.publishedVersionNumber === null) {
          throw new ConflictError("У одного из учеников сектор не опубликован или уже завершён", "EXAM_SESSION_STUDENT_NOT_READY");
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
  return prisma.sectorExamSession.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { exams: { where: { status: { not: "cancelled" } }, select: { id: true, planId: true, crmStudentId: true, studentNameSnapshot: true, status: true, scheduledAt: true, plan: { select: { examReadyAt: true } } } } } });
}

export async function sendExamSession(sessionId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM sector_exam_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
    const session = await tx.sectorExamSession.findUnique({ where: { id: sessionId }, include: { exams: true } });
    if (!session) throw new NotFoundError("Проведение экзамена");
    const active = session.exams.filter(exam => exam.status !== "cancelled");
    if (!active.length) throw new ConflictError("Добавьте участников экзамена", "EXAM_SESSION_EMPTY");
    if (active.some(exam => !["draft", "awaiting_schedule", "scheduled"].includes(exam.status))) throw new ConflictError("Экзамен уже начат или завершён", "EXAM_SESSION_ROSTER_LOCKED");
    const plans = await tx.learningPlan.findMany({where:{id:{in:active.map(exam=>exam.planId)}},select:{id:true,examReadyAt:true,status:true}});
    const unready = active.filter(exam => !plans.some(plan => plan.id===exam.planId && plan.examReadyAt && plan.status!=="closed"));
    if (unready.length) throw new ConflictError(`Нужна отметка преподавателя о готовности: ${unready.map(exam=>exam.studentNameSnapshot||exam.crmStudentId).join(", ")}`,"EXAM_SESSION_STUDENT_NOT_READY");
    await tx.sectorExam.updateMany({ where: { sessionId, status: "draft" }, data: { status: "awaiting_schedule", sentForScheduleAt: new Date() } });
    return tx.sectorExamSession.findUniqueOrThrow({ where: { id: sessionId }, include: { exams: true } });
  });
}


export const examSessionParticipantsInput = z.object({
  planIds: z.array(z.string().uuid()).min(1).max(30),
  expectedExamIds: z.array(z.string().uuid()).max(30),
});

/** Edit the roster only while every participant is still a draft; preserve removed entries. */
export async function updateExamSessionParticipants(actorUserId: string, sessionId: string, raw: z.infer<typeof examSessionParticipantsInput>) {
  const input = examSessionParticipantsInput.parse(raw);
  if (new Set(input.planIds).size !== input.planIds.length) throw new BadRequestError("Ученик добавлен дважды", "EXAM_SESSION_DUPLICATE_PLAN");
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM sector_exam_sessions WHERE id=${sessionId}::uuid FOR UPDATE`;
      const session = await tx.sectorExamSession.findUnique({ where: { id: sessionId }, include: { exams: { where: { status: { not: "cancelled" } } } } });
      if (!session) throw new NotFoundError("Проведение экзамена");
      if (session.exams.some(exam => exam.status !== "draft")) throw new ConflictError("Состав можно менять до отправки на назначение", "EXAM_SESSION_ROSTER_LOCKED");
      if (JSON.stringify(session.exams.map(exam => exam.id).sort()) !== JSON.stringify([...input.expectedExamIds].sort())) {
        throw new ConflictError("Состав экзамена изменился. Обновите список участников.", "EXAM_SESSION_ROSTER_STALE");
      }
      const snapshot = examProgramInput.parse(session.programSnapshot);
      const students = new Set<string>();
      const plans = [];
      for (const planId of [...input.planIds].sort()) {
        await tx.$queryRaw`SELECT id FROM learning_plans WHERE id=${planId}::uuid FOR UPDATE`;
        const plan = await tx.learningPlan.findUnique({ where: { id: planId }, include: { templateStep: { select: { number: true } } } });
        if (!plan || !plan.crmStudentId || plan.crmGroupId || plan.status === "closed" || plan.publishedVersionNumber === null) {
          throw new ConflictError("У одного из учеников сектор не опубликован или уже завершён", "EXAM_SESSION_STUDENT_NOT_READY");
        }
        if (plan.directionId !== snapshot.directionId || (plan.templateStep?.number ?? plan.sequence) !== snapshot.sectorNumber) {
          throw new BadRequestError("Программа не соответствует направлению и сектору ученика", "EXAM_SESSION_PROGRAM_MISMATCH");
        }
        if (students.has(plan.crmStudentId)) throw new BadRequestError("Ученик добавлен дважды", "EXAM_SESSION_DUPLICATE_STUDENT");
        students.add(plan.crmStudentId); plans.push(plan);
      }
      const names = await tx.user.findMany({ where: { crmStudentId: { in: [...students] }, deletedAt: null, role: { slug: "student" } },
        select: { crmStudentId: true, firstName: true, lastName: true, middleName: true } });
      const nameById = new Map(names.map(student => [student.crmStudentId, [student.lastName, student.firstName, student.middleName].filter(Boolean).join(" ")]));
      await tx.sectorExam.updateMany({ where: { sessionId, status: "draft", planId: { notIn: input.planIds } },
        data: { status: "cancelled", cancelledAt: new Date(), cancelReason: "Удалён из состава до назначения экзамена" } });
      const kept = new Set(session.exams.map(exam => exam.planId));
      for (const plan of plans) {
        if (kept.has(plan.id)) continue;
        await tx.sectorExam.create({ data: { sessionId, planId: plan.id, crmStudentId: plan.crmStudentId!, directionId: plan.directionId,
          createdById: actorUserId, programTitleSnapshot: snapshot.title, studentNameSnapshot: nameById.get(plan.crmStudentId!) ?? null,
          items: { create: snapshot.items.map((item, position) => ({ kind: "custom", title: item.title, criteria: item.criteria, position })) } } });
      }
      return tx.sectorExamSession.findUniqueOrThrow({ where: { id: sessionId }, include: { exams: { where: { status: { not: "cancelled" } } } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("У выбранного ученика уже есть открытый экзамен", "SECTOR_EXAM_ALREADY_OPEN");
    throw error;
  }
}


export const examSessionScheduleInput = z.object({
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), teacherId:z.string().min(1).max(128),roomId:z.string().min(1).max(128),
}).refine(value=>value.endTime>value.startTime,{message:"Окончание должно быть позже начала"});

/** Save the calendar appointment through CRM; its callback announces the exam to each pupil. */
export async function scheduleExamSession(actorUserId:string,sessionId:string,raw:z.infer<typeof examSessionScheduleInput>) {
  const input=examSessionScheduleInput.parse(raw);
  const session=await prisma.sectorExamSession.findUnique({where:{id:sessionId},include:{exams:{where:{status:{not:"cancelled"}}}}});
  if (!session) throw new NotFoundError("Экзамен");
  if (session.exams.some(exam=>!["draft","awaiting_schedule","scheduled"].includes(exam.status))) throw new ConflictError("Экзамен уже начат или завершён", "EXAM_SESSION_ROSTER_LOCKED");
  if (session.exams.length>20) throw new BadRequestError("В один экзамен можно назначить не больше 20 учеников", "EXAM_SESSION_TOO_LARGE");
  const sent = await sendExamSession(session.id);
  // Use the roster locked by send, which may have changed since the initial read.
  const participants = sent.exams.filter(exam => exam.status !== "cancelled");
  const {bookExamSessionInCrm}=await import("../../infrastructure/crm/crm-client.js");
  const result=await bookExamSessionInCrm({...input,examIds:participants.map(exam=>exam.id),actorAppUserId:actorUserId});
  const {scheduleSectorExamFromCrm}=await import("./sector-exam.service.js");
  const day=result.class.date.slice(0,10);
  const lessonAt=new Date(`${day}T${result.class.startTime}:00+05:00`);
  for (const exam of participants) await scheduleSectorExamFromCrm(exam.id,{crmClassId:result.class.id,lessonAt,crmTeacherId:result.class.teacherId});
  return {sessionId:session.id,crmClassId:result.class.id,scheduledAt:lessonAt,alreadyBooked:result.alreadyBooked};
}
