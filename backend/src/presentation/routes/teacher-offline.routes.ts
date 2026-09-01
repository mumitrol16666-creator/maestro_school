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
  teacherOfflineSetAttendance,
  teacherOfflineSetAttendanceBatch,
} from "../../application/services/teacher-offline.service.js";
import { listTeacherStudents } from "../../application/services/teacher-students.service.js";
import { openTeacherStudentDialog } from "../../application/services/learning-dialog-membership.service.js";
import { listTeacherGroups } from "../../application/services/teacher-groups.service.js";
import {
  completeTeacherStaffTaskFromApp,
  listTeacherStaffTasks,
} from "../../application/services/teacher-staff-tasks.service.js";
import { authenticate, requirePermission, requireTeacher } from "../guards/auth.guards.js";
import {
  learningLessonResultsSchema,
  offlineLessonStudentCheckSchema,
} from "./offline-lesson.schemas.js";
import {
  getGroupMonthlyPlanAdapted,
  getStudentMonthlyPlanAdapted,
  learningTopicsV2Enabled,
  publishGroupMonthlyPlanAdapted,
  publishStudentMonthlyPlanAdapted,
  saveGroupMonthlyPlanAdapted,
  saveStudentMonthlyPlanAdapted,
} from "../../application/services/monthly-plan-adapter.service.js";
import {
  getLearningTopicV2,
  updateLearningTopicProgressV2,
} from "../../application/services/learning-plan-v2.service.js";
import { listTeacherCrmDirections } from "../../application/services/crm-direction-projection.service.js";
import { isSupportedMaterialUrl } from "../../domain/group-material.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { applyLearningLessonV2Results } from "../../application/services/learning-lesson-v2.service.js";
import {
  deleteOfflineLessonDraft,
  getOfflineLessonDraft,
  listOfflineLessonReportVersions,
  saveOfflineLessonDraft,
} from "../../application/services/offline-lesson-report.service.js";

const readGuards = [authenticate, requirePermission("offline_school.read")];
const writeGuards = [authenticate, requirePermission("offline_school.write")];

export async function teacherOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/teachers/me/staff-tasks",
    { preHandler: [authenticate, requireTeacher] },
    async (request) => ({ data: await listTeacherStaffTasks(request.user!.id) }),
  );

  app.post(
    "/teachers/me/staff-tasks/:crmTaskId/complete",
    { preHandler: [authenticate, requireTeacher] },
    async (request) => {
      const { crmTaskId } = z.object({ crmTaskId: z.string().min(1).max(128) }).parse(request.params);
      return { data: await completeTeacherStaffTaskFromApp(request.user!.id, crmTaskId) };
    },
  );

  app.get(
    "/teachers/me/students",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => ({ data: await listTeacherStudents(request.user!.id) }),
  );

  app.post(
    "/teachers/me/students/:studentUserId/dialog",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => {
      const { studentUserId } = z.object({ studentUserId: z.string().uuid() }).parse(request.params);
      const { recipient } = z.object({ recipient: z.enum(["student", "parent"]) }).parse(request.body ?? {});
      return {
        data: await openTeacherStudentDialog(request.user!.id, studentUserId, recipient),
      };
    },
  );

  app.get(
    "/teachers/me/groups",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => ({ data: await listTeacherGroups(request.user!.id) }),
  );

  const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
  const monthlyPlanItemSchema = z.object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(1000),
    status: z.enum(["planned", "in_progress", "completed"]),
    masteryCriteria: z.string().max(5000).optional(),
  });

  app.get(
    "/teachers/me/students/:crmStudentId/monthly-plan",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => {
      const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
      const { month, crmDirectionId } = z.object({
        month: monthSchema,
        crmDirectionId: z.string().min(1).max(128).optional(),
      }).parse(request.query);
      return {
        data: await getStudentMonthlyPlanAdapted(
          request.user!.id,
          crmStudentId,
          month,
          crmDirectionId,
        ),
      };
    },
  );

  app.put(
    "/teachers/me/students/:crmStudentId/monthly-plan",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request) => {
      const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
      const body = z.object({
        month: monthSchema,
        goal: z.string().max(5000).default(""),
        expectedResult: z.string().max(5000).default(""),
        skills: z.string().max(5000).default(""),
        checkpoint: z.string().max(5000).default(""),
        note: z.string().max(5000).default(""),
        items: z.array(monthlyPlanItemSchema).max(50).default([]),
        crmDirectionId: z.string().min(1).max(128).optional(),
        expectedVersion: z.number().int().nonnegative().optional(),
      }).parse(request.body ?? {});
      const plan = await saveStudentMonthlyPlanAdapted(
        request.user!.id,
        crmStudentId,
        body.month,
        body,
        body.crmDirectionId,
      );
      if (!plan.idempotent) {
        await writeAuditLog({
          entityType: "student_monthly_plan",
          entityId: plan.id,
          action: "update",
          actorId: request.user!.id,
          payload: {
            event: "monthly_plan_draft_saved",
            month: plan.month,
            itemCount: plan.items.length,
            draftRevision: plan.publication.draftRevision,
            progressPercent: plan.progress.percent,
          },
        });
      }
      return {
        data: plan,
      };
    },
  );

  app.post(
    "/teachers/me/students/:crmStudentId/monthly-plan/publish",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request) => {
      const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
      const body = z.object({
        month: monthSchema,
        expectedDraftRevision: z.number().int().positive().optional(),
        crmDirectionId: z.string().min(1).max(128).optional(),
      }).parse(request.body ?? {});
      const plan = await publishStudentMonthlyPlanAdapted(
        request.user!.id,
        crmStudentId,
        body.month,
        body.expectedDraftRevision,
        body.crmDirectionId,
      );
      if (!plan.idempotent && plan.publicationEvent) {
        await writeAuditLog({
          entityType: "student_monthly_plan",
          entityId: plan.id,
          action: "publish",
          actorId: request.user!.id,
          payload: {
            event: plan.publicationEvent,
            month: plan.month,
            itemCount: plan.items.length,
            publishedRevision: plan.publication.publishedRevision,
            progressPercent: plan.progress.percent,
          },
        });
      }
      return {
        data: plan,
      };
    },
  );

  const groupPlanMaterialSchema = z.object({
    id: z.string().min(1).max(100),
    title: z.string().trim().max(500),
    url: z.string().trim().max(2000).refine(isSupportedMaterialUrl, {
      message: "Ссылка должна начинаться с http:// или https://",
    }),
    note: z.string().trim().max(2000),
  }).refine(
    (material) => Boolean(material.title || material.url || material.note),
    { message: "Материал не может быть пустым" },
  );

  app.get(
    "/teachers/me/groups/:crmGroupId/monthly-plan",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => {
      const { crmGroupId } = z.object({ crmGroupId: z.string().min(1).max(128) }).parse(request.params);
      const { month, crmDirectionId } = z.object({
        month: monthSchema,
        crmDirectionId: z.string().min(1).max(128).optional(),
      }).parse(request.query);
      return {
        data: await getGroupMonthlyPlanAdapted(
          request.user!.id,
          crmGroupId,
          month,
          crmDirectionId,
        ),
      };
    },
  );

  app.put(
    "/teachers/me/groups/:crmGroupId/monthly-plan",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request) => {
      const { crmGroupId } = z.object({ crmGroupId: z.string().min(1).max(128) }).parse(request.params);
      const body = z.object({
        month: monthSchema,
        goal: z.string().max(5000).default(""),
        expectedResult: z.string().max(5000).default(""),
        skills: z.string().max(5000).default(""),
        checkpoint: z.string().max(5000).default(""),
        note: z.string().max(5000).default(""),
        items: z.array(monthlyPlanItemSchema).max(50).default([]),
        materials: z.array(groupPlanMaterialSchema).max(50).default([]),
        crmDirectionId: z.string().min(1).max(128).optional(),
        expectedVersion: z.number().int().nonnegative().optional(),
      }).parse(request.body ?? {});
      const plan = await saveGroupMonthlyPlanAdapted(
        request.user!.id,
        crmGroupId,
        body.month,
        body,
        body.crmDirectionId,
      );
      if (!plan.idempotent) {
        await writeAuditLog({
          entityType: "group_monthly_plan",
          entityId: plan.id,
          action: "update",
          actorId: request.user!.id,
          payload: {
            event: "monthly_plan_draft_saved",
            month: plan.month,
            itemCount: plan.items.length,
            draftRevision: plan.publication.draftRevision,
            progressPercent: plan.progress.percent,
          },
        });
      }
      return {
        data: plan,
      };
    },
  );

  app.post(
    "/teachers/me/groups/:crmGroupId/monthly-plan/publish",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request) => {
      const { crmGroupId } = z.object({ crmGroupId: z.string().min(1).max(128) }).parse(request.params);
      const body = z.object({
        month: monthSchema,
        expectedDraftRevision: z.number().int().positive().optional(),
        crmDirectionId: z.string().min(1).max(128).optional(),
      }).parse(request.body ?? {});
      const plan = await publishGroupMonthlyPlanAdapted(
        request.user!.id,
        crmGroupId,
        body.month,
        body.expectedDraftRevision,
        body.crmDirectionId,
      );
      if (!plan.idempotent && plan.publicationEvent) {
        await writeAuditLog({
          entityType: "group_monthly_plan",
          entityId: plan.id,
          action: "publish",
          actorId: request.user!.id,
          payload: {
            event: plan.publicationEvent,
            month: plan.month,
            itemCount: plan.items.length,
            publishedRevision: plan.publication.publishedRevision,
            progressPercent: plan.progress.percent,
          },
        });
      }
      return {
        data: plan,
      };
    },
  );

  if (learningTopicsV2Enabled()) {
    app.get(
      "/teachers/me/crm-directions",
      { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
      async (request) => ({ data: await listTeacherCrmDirections(request.user!.id) }),
    );

    app.get(
      "/teachers/me/learning-topics/:topicId",
      { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
      async (request) => {
        const { topicId } = z.object({ topicId: z.string().uuid() }).parse(request.params);
        return { data: await getLearningTopicV2(request.user!.id, topicId) };
      },
    );

    app.patch(
      "/teachers/me/learning-topics/:topicId/progress",
      { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
      async (request) => {
        const { topicId } = z.object({ topicId: z.string().uuid() }).parse(request.params);
        const body = z.object({
          toPercent: z.number().int().min(0).max(100),
          expectedPercent: z.number().int().min(0).max(100).nullable(),
          sourceKey: z.string().trim().min(1).max(255),
          comment: z.string().max(5000).optional(),
        }).parse(request.body ?? {});
        const topic = await updateLearningTopicProgressV2(
          request.user!.id,
          topicId,
          body,
        );
        if (!topic.idempotent) {
          await writeAuditLog({
            entityType: "learning_topic",
            entityId: topic.id,
            action: "update",
            actorId: request.user!.id,
            payload: {
              event: "learning_topic_progress_changed",
              toPercent: topic.progressPercent,
              sourceKey: body.sourceKey,
            },
          });
        }
        return { data: topic };
      },
    );
  }

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

  app.get(
    "/teachers/me/offline-lessons/:crmClassId/draft",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getTeacherOfflineClass(request.user!.id, crmClassId);
      return { data: await getOfflineLessonDraft(crmClassId, request.user!.id) };
    },
  );

  app.put(
    "/teachers/me/offline-lessons/:crmClassId/draft",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getTeacherOfflineClass(request.user!.id, crmClassId);
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
    "/teachers/me/offline-lessons/:crmClassId/draft",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getTeacherOfflineClass(request.user!.id, crmClassId);
      return { data: await deleteOfflineLessonDraft(crmClassId, request.user!.id) };
    },
  );

  app.get(
    "/teachers/me/offline-lessons/:crmClassId/report-versions",
    { preHandler: readGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getTeacherOfflineClass(request.user!.id, crmClassId);
      return { data: await listOfflineLessonReportVersions(crmClassId) };
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
    "/teachers/me/offline-lessons/:crmClassId/attendance",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = offlineLessonStudentCheckSchema.parse(request.body ?? {});
      return {
        data: await teacherOfflineSetAttendance(
          request.user!.id,
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
    "/teachers/me/offline-lessons/:crmClassId/attendance-batch",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      const body = z.object({
        checks: z.array(offlineLessonStudentCheckSchema).min(1).max(50),
      }).parse(request.body ?? {});
      return {
        data: await teacherOfflineSetAttendanceBatch(
          request.user!.id,
          crmClassId,
          body.checks,
        ),
      };
    },
  );

  app.post(
    "/teachers/me/offline-lessons/:crmClassId/learning-results",
    { preHandler: writeGuards },
    async (request) => {
      const { crmClassId } = z.object({ crmClassId: z.string().min(1) }).parse(request.params);
      await getTeacherOfflineClass(request.user!.id, crmClassId);
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
        trialReport: z.record(z.string(), z.unknown()).optional(),
        comment: z.string().max(5000).optional(),
        materials: z.array(z.object({
          type: z.string().optional(),
          url: z.string().optional(),
          title: z.string().optional(),
          description: z.string().max(2000).nullable().optional(),
          mimeType: z.string().max(255).nullable().optional(),
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
      const body = z.object({ comment: z.string().trim().min(3).max(5000) }).parse(request.body ?? {});
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
