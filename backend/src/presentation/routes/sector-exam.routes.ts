import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticate,
  requireOfflineCoordinator,
  requirePermission,
  requireTeacher,
} from "../guards/auth.guards.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import {
  SECTOR_EXAM_MAX_ITEMS,
  cancelSectorExam,
  createSectorExam,
  finishSectorExam,
  listAdminSectorExamBoard,
  listTeacherStudentSectorExams,
  markSectorExamItem,
  sectorExamTemplate,
  sendSectorExamForSchedule,
  startSectorExam,
  updateSectorExamItems,
} from "../../application/services/sector-exam.service.js";

/** Plan 1.10: the sector exam. The admin prepares it, CRM books it, the teacher holds it at the school. */

const itemsSchema = z.array(z.object({
  kind: z.enum(["topic", "custom"]),
  topicId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  criteria: z.string().max(2000).nullable().optional(),
})).min(1).max(SECTOR_EXAM_MAX_ITEMS);

const examParams = z.object({ examId: z.string().uuid() });

export async function sectorExamRoutes(app: FastifyInstance) {
  const coordinatorRead = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.read")];
  const coordinatorWrite = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.write")];
  const teacherRead = [authenticate, requireTeacher, requirePermission("offline_school.read")];
  const teacherWrite = [authenticate, requireTeacher, requirePermission("offline_school.write")];

  app.get("/admin/sector-exams", { preHandler: coordinatorRead }, async () => ({
    data: await listAdminSectorExamBoard(),
  }));

  app.get("/admin/sector-exams/template/:planId", { preHandler: coordinatorRead }, async (request) => {
    const { planId } = z.object({ planId: z.string().uuid() }).parse(request.params);
    return { data: await sectorExamTemplate(planId) };
  });

  app.post("/admin/sector-exams", { preHandler: coordinatorWrite }, async (request, reply) => {
    const body = z.object({ planId: z.string().uuid(), items: itemsSchema, send: z.boolean().optional() }).parse(request.body);
    const exam = await createSectorExam(request.user!.id, body);
    await writeAuditLog({
      entityType: "sector_exam", entityId: exam.id, action: "create", actorId: request.user!.id,
      payload: { planId: exam.planId, items: exam.items.length, status: exam.status },
    });
    return reply.status(201).send({ data: exam });
  });

  app.put("/admin/sector-exams/:examId/items", { preHandler: coordinatorWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    const body = z.object({ items: itemsSchema }).parse(request.body);
    return { data: await updateSectorExamItems(examId, body.items) };
  });

  app.post("/admin/sector-exams/:examId/send", { preHandler: coordinatorWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    const exam = await sendSectorExamForSchedule(examId);
    await writeAuditLog({
      entityType: "sector_exam", entityId: exam.id, action: "update", actorId: request.user!.id,
      payload: { event: "sent_for_schedule" },
    });
    return { data: exam };
  });

  app.post("/admin/sector-exams/:examId/cancel", { preHandler: coordinatorWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    const body = z.object({ reason: z.string().max(255).nullable().optional() }).parse(request.body ?? {});
    const exam = await cancelSectorExam(examId, body.reason ?? null);
    await writeAuditLog({
      entityType: "sector_exam", entityId: exam.id, action: "update", actorId: request.user!.id,
      payload: { event: "cancelled", reason: exam.cancelReason },
    });
    return { data: exam };
  });

  app.get("/teachers/me/students/:crmStudentId/sector-exams", { preHandler: teacherRead }, async (request) => {
    const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
    return { data: await listTeacherStudentSectorExams(request.user!.id, crmStudentId) };
  });

  app.post("/teachers/me/sector-exams/:examId/start", { preHandler: teacherWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    return { data: await startSectorExam(request.user!.id, examId) };
  });

  app.put("/teachers/me/sector-exams/:examId/items/:itemId", { preHandler: teacherWrite }, async (request) => {
    const { examId, itemId } = z.object({ examId: z.string().uuid(), itemId: z.string().uuid() }).parse(request.params);
    const body = z.object({ done: z.boolean() }).parse(request.body);
    return { data: await markSectorExamItem(request.user!.id, examId, itemId, body.done) };
  });

  app.post("/teachers/me/sector-exams/:examId/finish", { preHandler: teacherWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    const body = z.object({
      decision: z.enum(["close_sector", "retake"]),
      comment: z.string().max(2000).nullable().optional(),
    }).parse(request.body);
    const result = await finishSectorExam(request.user!.id, examId, body);
    await writeAuditLog({
      entityType: "sector_exam", entityId: examId, action: "update", actorId: request.user!.id,
      payload: {
        event: "finished", decision: body.decision, outcome: result.exam.outcome,
        retakeExamId: result.retakeExamId, awardedPoints: result.awardedPoints,
      },
    });
    return { data: result };
  });
}
