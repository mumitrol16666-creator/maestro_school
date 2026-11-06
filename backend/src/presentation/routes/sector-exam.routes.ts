import { studentSectorStatistics } from "../../application/services/sector-study.service.js";
import { assertParentChildLink } from "../../application/services/family.service.js";
import { getParentVisibility } from "../../application/services/parent-visibility.service.js";
import { ForbiddenError } from "../../domain/errors.js";
import { getSectorCertificate } from "../../application/services/sector-certificate.service.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { examProgramInput, examSessionInput, listExamPrograms, saveExamProgram, createExamSession, listExamSessions, cancelExamSession, examSessionParticipantsInput, updateExamSessionParticipants, examSessionScheduleInput, scheduleExamSession } from "../../application/services/sector-exam-program.service.js";
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
  getExamSessionWorkspace,
  listExamSessionsForLesson,
  getPersonalExam,
  finishSectorExam,
  listAdminSectorExamBoard,
  listTeacherStudentSectorExams,
  markSectorExamItem,
  startSectorExam,
  markStudentSectorReady,
} from "../../application/services/sector-exam.service.js";

/** The session builder is the only preparation and assignment flow. */

const examParams = z.object({ examId: z.string().uuid() });

export async function sectorExamRoutes(app: FastifyInstance) {
  const coordinatorRead = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.read")];
  const coordinatorWrite = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.write")];
  const teacherRead = [authenticate, requireTeacher, requirePermission("offline_school.read")];
  const teacherWrite = [authenticate, requireTeacher, requirePermission("offline_school.write")];

  app.get("/teachers/me/students/:crmStudentId/sector-statistics", { preHandler: teacherRead }, async request => {
    const {crmStudentId}=z.object({crmStudentId:z.string().min(1).max(128)}).parse(request.params);
    await listTeacherStudentSectorExams(request.user!.id,crmStudentId);
    return {data:await studentSectorStatistics(crmStudentId)};
  });
  app.get("/students/me/sector-statistics", { preHandler: [authenticate, requirePermission("progress.read")] }, async request => {
    if (request.user!.roleSlug !== "student") throw new ForbiddenError("Доступно ученику");
    const user=await prisma.user.findUniqueOrThrow({where:{id:request.user!.id},select:{crmStudentId:true}});
    return {data:user.crmStudentId?await studentSectorStatistics(user.crmStudentId):[]};
  });
  app.get("/parents/me/children/:studentId/sector-statistics", { preHandler: [authenticate, requirePermission("family.read")] }, async request => {
    if (request.user!.roleSlug !== "parent") throw new ForbiddenError("Доступно родителю");
    const {studentId}=z.object({studentId:z.string().uuid()}).parse(request.params);
    const link=await assertParentChildLink(request.user!.id,studentId);
    if (!(await getParentVisibility(studentId)).showPlanProgress) throw new ForbiddenError("Учебные результаты скрыты настройками семейного доступа");
    return {data:link.student.crmStudentId?await studentSectorStatistics(link.student.crmStudentId):[]};
  });

  app.get("/sector-certificates/:examId", { preHandler: [authenticate] }, async request => {
    const role = request.user!.roleSlug;
    await requirePermission(role === "parent" ? "family.read" : role === "student" ? "progress.read" : "offline_school.read")(request);
    const {examId}=examParams.parse(request.params);
    return {data:await getSectorCertificate(request.user!.id,examId)};
  });

  app.get("/admin/exam-scheduling-options", {preHandler:coordinatorRead},async()=>{
    const {fetchExamSchedulingOptions}=await import("../../infrastructure/crm/crm-client.js");
    return {data:await fetchExamSchedulingOptions()};
  });
  app.post("/admin/exam-sessions/:id/schedule",{preHandler:coordinatorWrite},async request=>{
    const {id}=z.object({id:z.string().uuid()}).parse(request.params);
    const result=await scheduleExamSession(request.user!.id,id,examSessionScheduleInput.parse(request.body));
    await writeAuditLog({entityType:"exam_session",entityId:id,action:"update",actorId:request.user!.id,payload:{event:"scheduled",crmClassId:result.crmClassId}});
    return {data:result};
  });
  app.get("/admin/exam-program-directions", { preHandler: coordinatorRead }, async () => ({ data: await prisma.direction.findMany({ where: { crmIsActive: true, deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }) }));
  app.get("/admin/exam-programs", { preHandler: coordinatorRead }, async () => ({ data: await listExamPrograms() }));
  app.post("/admin/exam-programs", { preHandler: coordinatorWrite }, async request => {
    const program = await saveExamProgram(request.user!.id, examProgramInput.parse(request.body));
    await writeAuditLog({entityType:"exam_program",entityId:program.id,action:"create",actorId:request.user!.id,payload:{revision:program.revision}});
    return { data: program };
  });
  app.put("/admin/exam-programs/:id", { preHandler: coordinatorWrite }, async request => {
    const {id}=z.object({id:z.string().uuid()}).parse(request.params);
    const body=examProgramInput.extend({expectedRevision:z.number().int().positive()}).parse(request.body);
    const program=await saveExamProgram(request.user!.id,body,id,body.expectedRevision);
    await writeAuditLog({entityType:"exam_program",entityId:id,action:"update",actorId:request.user!.id,payload:{revision:program.revision}});
    return {data:program};
  });
  app.get("/teachers/me/offline-classes/:crmClassId/exam-sessions", {preHandler:teacherRead}, async request=>{
    const {crmClassId}=z.object({crmClassId:z.string().min(1).max(128)}).parse(request.params);
    return {data:await listExamSessionsForLesson(request.user!.id,crmClassId)};
  });
  app.get("/personal-exams/:examId",{preHandler:[authenticate]},async request=>{
    const role=request.user!.roleSlug;
    await requirePermission(role==="parent"?"family.read":role==="student"?"progress.read":"offline_school.read")(request);
    const {examId}=examParams.parse(request.params);
    return {data:await getPersonalExam(request.user!.id,examId)};
  });
  app.get("/exam-sessions/:id", { preHandler: [authenticate, requirePermission("offline_school.read")] }, async request => {
    const {id}=z.object({id:z.string().uuid()}).parse(request.params);
    return {data:await getExamSessionWorkspace(request.user!.id,id)};
  });
  app.get("/admin/exam-sessions", { preHandler: coordinatorRead }, async () => ({data:await listExamSessions()}));
  app.post("/admin/exam-sessions", { preHandler: coordinatorWrite }, async request => {
    const session=await createExamSession(request.user!.id,examSessionInput.parse(request.body));
    await writeAuditLog({entityType:"exam_session",entityId:session.id,action:"create",actorId:request.user!.id,payload:{participants:session.exams.length}});
    return {data:session};
  });
  app.put("/admin/exam-sessions/:id/participants", { preHandler: coordinatorWrite }, async request => {
    const {id}=z.object({id:z.string().uuid()}).parse(request.params);
    const session=await updateExamSessionParticipants(request.user!.id,id,examSessionParticipantsInput.parse(request.body));
    await writeAuditLog({entityType:"exam_session",entityId:id,action:"update",actorId:request.user!.id,payload:{event:"participants_updated",participants:session.exams.length}});
    return {data:session};
  });
  app.post("/admin/exam-sessions/:id/cancel", { preHandler: coordinatorWrite }, async request => {
    const {id}=z.object({id:z.string().uuid()}).parse(request.params);
    const result=await cancelExamSession(id);
    await writeAuditLog({entityType:"exam_session",entityId:id,action:"update",actorId:request.user!.id,payload:{event:"cancelled"}});
    return {data:result};
  });

  app.get("/admin/sector-exams", { preHandler: coordinatorRead }, async () => ({
    data: await listAdminSectorExamBoard(),
  }));

  app.get("/teachers/me/students/:crmStudentId/sector-exams", { preHandler: teacherRead }, async (request) => {
    const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
    return { data: await listTeacherStudentSectorExams(request.user!.id, crmStudentId) };
  });

  app.post("/teachers/me/sector-exams/:examId/start", { preHandler: teacherWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    return { data: await startSectorExam(request.user!.id, examId) };
  });

  app.post("/teachers/me/students/:crmStudentId/sectors/:planId/exam-readiness", { preHandler: teacherWrite }, async request => {
    const { crmStudentId, planId } = z.object({ crmStudentId: z.string().min(1).max(128), planId: z.string().uuid() }).parse(request.params);
    return { data: await markStudentSectorReady(request.user!.id, crmStudentId, planId) };
  });

  app.put("/teachers/me/sector-exams/:examId/items/:itemId", { preHandler: teacherWrite }, async (request) => {
    const { examId, itemId } = z.object({ examId: z.string().uuid(), itemId: z.string().uuid() }).parse(request.params);
    const body = z.object({ done: z.boolean() }).parse(request.body);
    return { data: await markSectorExamItem(request.user!.id, examId, itemId, body.done) };
  });

  app.post("/teachers/me/sector-exams/:examId/finish", { preHandler: teacherWrite }, async (request) => {
    const { examId } = examParams.parse(request.params);
    const body = z.object({
      decision: z.enum(["pass", "retake"]),
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
