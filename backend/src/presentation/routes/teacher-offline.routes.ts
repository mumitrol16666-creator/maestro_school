import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getTeacherOfflineAgenda,
  getTeacherOfflineClass,
  getTeacherOfflineClassStudents,
  teacherOfflineFinish,
  teacherOfflineMarkNotHeld,
  teacherOfflineWithdraw,
  teacherOfflineStart,
  teacherOfflineSubmit,
} from "../../application/services/teacher-offline.service.js";
import { listTeacherStudents } from "../../application/services/teacher-students.service.js";
import { authenticate, requirePermission, requireTeacher } from "../guards/auth.guards.js";

const readGuards = [authenticate, requirePermission("offline_school.read")];
const writeGuards = [authenticate, requirePermission("offline_school.write")];

export async function teacherOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/teachers/me/students",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => ({ data: await listTeacherStudents(request.user!.id) }),
  );

  app.get(
    "/teachers/me/offline-lessons",
    { preHandler: readGuards },
    async (request) => {
      const query = z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }).parse(request.query);
      return { data: await getTeacherOfflineAgenda(request.user!.id, query) };
    },
  );

  app.get(
    "/teachers/me/offline-lessons/:crmClassId",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await getTeacherOfflineClass(request.user!.id, crmClassId) };
    },
  );

  app.get(
    "/teachers/me/offline-lessons/:crmClassId/students",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await getTeacherOfflineClassStudents(request.user!.id, crmClassId) };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/start",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await teacherOfflineStart(request.user!.id, crmClassId) };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/finish",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ comment: z.string().max(5000).optional() }).parse(request.body ?? {});
      return { data: await teacherOfflineFinish(request.user!.id, crmClassId, body.comment) };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/submit",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({
        topic: z.string().max(5000).optional(),
        lessonGoals: z.string().max(5000).optional(),
        lessonSummary: z.string().max(10000).optional(),
        homeworkDraft: z.string().max(10000).optional(),
        nextLessonFocus: z.string().max(5000).optional(),
        teacherOutcomeHint: z.enum(["held", "not_held", "no_submission"]).optional(),
        comment: z.string().max(5000).optional(),
        materials: z.array(z.object({
          type: z.string().optional(),
          url: z.string().optional(),
          title: z.string().optional(),
        })).optional(),
      }).parse(request.body ?? {});
      return { data: await teacherOfflineSubmit(request.user!.id, crmClassId, body) };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/not-held",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ comment: z.string().max(5000).optional() }).parse(request.body ?? {});
      return { data: await teacherOfflineMarkNotHeld(request.user!.id, crmClassId, body.comment) };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/withdraw",
    { preHandler: [authenticate, requireTeacher] },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ reason: z.string().min(3).max(1000) }).parse(request.body ?? {});
      return { data: await teacherOfflineWithdraw(request.user!.id, crmClassId, body.reason) };
    },
  );
}
