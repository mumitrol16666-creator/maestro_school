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
import {
  learningLessonResultsSchema,
  offlineLessonStudentCheckSchema,
} from "./offline-lesson.schemas.js";
import { applyLearningLessonV2Results } from "../../application/services/learning-lesson-v2.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import {
  listCrmSyncJournal,
  resolveCrmSyncConflict,
  retryCrmOutboxEvent,
} from "../../application/services/crm-outbox.service.js";
import {
  deleteOfflineLessonDraft,
  getOfflineLessonDraft,
  listOfflineLessonReportVersions,
  saveOfflineLessonDraft,
} from "../../application/services/offline-lesson-report.service.js";

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
    description: z.string().max(2000).nullable().optional(),
    mimeType: z.string().max(255).nullable().optional(),
  })).optional(),
});

export async function adminOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/admin/crm-sync-journal",
    { preHandler: readGuards },
    async (request) => {
      const query = z.object({ crmClassId: z.string().min(1).optional() }).parse(request.query);
      return { data: await listCrmSyncJournal(query.crmClassId) };
    },
  );

  app.post(
    "/admin/crm-sync-journal/events/:eventId/retry",
    { preHandler: writeGuards },
    async (request) => {
      const { eventId } = z.object({ eventId: z.string().uuid() }).parse(request.params);
      const result = await retryCrmOutboxEvent(eventId);
      await writeAuditLog({
        entityType: "crm_outbox_event",
        entityId: eventId,
        action: "update",
        actorId: request.user!.id,
        payload: { event: "crm_delivery_retried" },
      });
      return { data: result };
    },
  );

  app.post(
    "/admin/crm-sync-journal/conflicts/:conflictId/resolve",
    { preHandler: writeGuards },
    async (request) => {
      const { conflictId } = z.object({ conflictId: z.string().uuid() }).parse(request.params);
      const body = z.object({
        resolution: z.enum(["accept_crm", "retry_local"]),
        reason: z.string().trim().min(3).max(2000),
      }).parse(request.body ?? {});
      const result = await resolveCrmSyncConflict(
        conflictId,
        request.user!.id,
        body.resolution,
        body.reason,
      );
      await writeAuditLog({
        entityType: "crm_sync_conflict",
        entityId: conflictId,
        action: "update",
        actorId: request.user!.id,
        payload: {
          event: "crm_sync_conflict_resolved",
          resolution: body.resolution,
          reason: body.reason,
        },
      });
      return { data: result };
    },
  );

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
      return { data: await getAdminOfflineClassStudents(request.user!.id, crmClassId) };
    },
  );

  app.get(
    "/admin/offline-lessons/:crmClassId/report-versions",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      return { data: await listOfflineLessonReportVersions(crmClassId) };
    },
  );

  app.get(
    "/admin/offline-lessons/:crmClassId/draft",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getAdminOfflineClass(crmClassId);
      return { data: await getOfflineLessonDraft(crmClassId, request.user!.id) };
    },
  );

  app.put(
    "/admin/offline-lessons/:crmClassId/draft",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getAdminOfflineClass(crmClassId);
      const body = z.object({
        expectedRevision: z.number().int().nonnegative(),
        payload: z.record(z.string(), z.unknown()),
      }).parse(request.body ?? {});
      return {
        data: await saveOfflineLessonDraft({
          crmClassId,
          ownerUserId: request.user!.id,
          payload: body.payload,
          expectedRevision: body.expectedRevision,
        }),
      };
    },
  );

  app.delete(
    "/admin/offline-lessons/:crmClassId/draft",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getAdminOfflineClass(crmClassId);
      return { data: await deleteOfflineLessonDraft(crmClassId, request.user!.id) };
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
          body.lessonPoints,
          body.monthlyPlanId,
          body.planTopicUpdates,
        ),
      };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/learning-results",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = learningLessonResultsSchema.parse(request.body ?? {});
      const result = await applyLearningLessonV2Results(
        request.user!.id,
        crmClassId,
        body,
      );
      await writeAuditLog({
        entityType: "offline_lesson",
        entityId: crmClassId,
        action: "update",
        actorId: request.user!.id,
        payload: {
          event: "learning_lesson_results_applied",
          homeworkDecisionCount: body.homeworkDecisions.length,
          topicUpdateCount: body.topicUpdates.length,
        },
      });
      return { data: result };
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
      return { data: await adminOfflineSubmit(request.user!.id, crmClassId, body) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/not-held-for-teacher",
    { preHandler: actForTeacherGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ comment: z.string().trim().min(3).max(5000) }).parse(request.body ?? {});
      return { data: await adminOfflineMarkNotHeld(request.user!.id, crmClassId, body.comment) };
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
          description: z.string().max(2000).nullable().optional(),
          mimeType: z.string().max(255).nullable().optional(),
        })).optional(),
      }).parse(request.body ?? {});
      return { data: await adminOfflineApprove(request.user!.id, crmClassId, body) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/return-to-teacher",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ reason: z.string().min(3).max(1000) }).parse(request.body ?? {});
      return { data: await adminOfflineReturn(request.user!.id, crmClassId, body.reason) };
    },
  );

  app.post(
    "/admin/offline-lessons/:crmClassId/reopen",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({ reason: z.string().min(3).max(1000) }).parse(request.body ?? {});
      const result = await adminOfflineReopen(request.user!.id, crmClassId, body.reason);
      await writeAuditLog({
        entityType: "offline_lesson",
        entityId: crmClassId,
        action: "update",
        actorId: request.user!.id,
        payload: {
          event: "offline_lesson_reopened",
          reason: body.reason,
          correction: result.correction,
        },
      });
      return { data: result };
    },
  );

}
