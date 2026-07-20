import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  adminOfflineApprove,
  adminOfflineMarkNotHeld,
  adminOfflineReopen,
  adminOfflineReturn,
  adminOfflineSetAttendance,
  adminOfflineStart,
  adminOfflineSubmit,
  adminOfflineWhatsappDrafts,
  getAdminOfflineClass,
  getAdminOfflineAgenda,
  getAdminOfflineClassStudents,
  getPendingReviewAgenda,
} from "../../application/services/admin-offline.service.js";
import {
  authenticate,
  requireContentAdmin,
  requireOfflineCoordinator,
  requirePermission,
} from "../guards/auth.guards.js";
import { offlineLessonStudentCheckSchema } from "./offline-lesson.schemas.js";

const readGuards = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.read")];
const writeGuards = [authenticate, requireOfflineCoordinator, requirePermission("offline_school.write")];
const actForTeacherGuards = [
  authenticate,
  requireContentAdmin,
  requirePermission("offline_school.write"),
];

const teacherReportSchema = z.object({
  topic: z.string().max(5000).optional(),
  lessonGoals: z.string().max(5000).optional(),
  lessonSummary: z.string().max(10000).optional(),
  homeworkDraft: z.string().max(10000).optional(),
  nextLessonFocus: z.string().max(5000).optional(),
  comment: z.string().max(5000).optional(),
  teacherOutcomeHint: z.enum(["held", "not_held", "no_submission"]).optional(),
  trialReport: z.record(z.string(), z.unknown()).optional(),
  materials: z.array(z.object({
    type: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
  })).optional(),
});

export async function adminOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/admin/offline-lessons",
    { preHandler: readGuards },
    async () => ({ data: await getAdminOfflineAgenda() }),
  );

  app.get(
    "/admin/offline-lessons/pending-review",
    { preHandler: readGuards },
    async () => ({ data: await getPendingReviewAgenda() }),
  );

  app.get(
    "/admin/offline-lessons/:crmClassId",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await getAdminOfflineClass(crmClassId) };
    },
  );

  app.get(
    "/admin/offline-lessons/:crmClassId/students",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await getAdminOfflineClassStudents(crmClassId) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/attendance",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = offlineLessonStudentCheckSchema.parse(request.body ?? {});
      return {
        data: await adminOfflineSetAttendance(
          crmClassId,
          body.studentId,
          body.attendanceStatus,
          body.teacherNote,
          body.homeworkReview,
        ),
      };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/start-for-teacher",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await adminOfflineStart(crmClassId) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/submit-for-teacher",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = teacherReportSchema.parse(request.body ?? {});
      return { data: await adminOfflineSubmit(crmClassId, body) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/not-held-for-teacher",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ comment: z.string().trim().min(3).max(5000) }).parse(request.body ?? {});
      return { data: await adminOfflineMarkNotHeld(crmClassId, body.comment) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/approve",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({
        deduct: z.boolean().optional(),
        topic: z.string().max(5000).optional(),
        lessonGoals: z.string().max(5000).optional(),
        lessonSummary: z.string().max(10000).optional(),
        homeworkDraft: z.string().max(10000).optional(),
        nextLessonFocus: z.string().max(5000).optional(),
        teacherComment: z.string().max(5000).optional(),
        trialReport: z.record(z.string(), z.unknown()).optional(),
        materials: z.array(z.object({
          type: z.string().optional(),
          url: z.string().optional(),
          title: z.string().optional(),
        })).optional(),
      }).parse(request.body ?? {});
      return { data: await adminOfflineApprove(crmClassId, body) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/return-to-teacher",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ reason: z.string().min(3).max(1000) }).parse(request.body ?? {});
      return { data: await adminOfflineReturn(crmClassId, body.reason) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/reopen",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ reason: z.string().min(3).max(1000) }).parse(request.body ?? {});
      return { data: await adminOfflineReopen(crmClassId, body.reason) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/whatsapp-homework-drafts",
    {
      preHandler: writeGuards,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ studentId: z.string().min(1).optional() }).parse(request.body ?? {});
      return { data: await adminOfflineWhatsappDrafts(crmClassId, body.studentId) };
    },
  );
}
