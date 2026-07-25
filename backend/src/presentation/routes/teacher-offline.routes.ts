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
import { listTeacherGroups } from "../../application/services/teacher-groups.service.js";
import {
  completeTeacherStaffTaskFromApp,
  listTeacherStaffTasks,
} from "../../application/services/teacher-staff-tasks.service.js";
import { authenticate, requirePermission, requireTeacher } from "../guards/auth.guards.js";
import { offlineLessonStudentCheckSchema } from "./offline-lesson.schemas.js";
import {
  getStudentMonthlyPlan,
  saveStudentMonthlyPlan,
} from "../../application/services/student-monthly-plan.service.js";
import {
  getGroupMonthlyPlan,
  saveGroupMonthlyPlan,
} from "../../application/services/group-monthly-plan.service.js";
import { isSupportedMaterialUrl } from "../../domain/group-material.js";

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

  app.get(
    "/teachers/me/groups",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => ({ data: await listTeacherGroups(request.user!.id) }),
  );

  const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
  const monthlyPlanItemSchema = z.object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(1000),
    status: z.enum(["planned", "in_progress", "completed", "moved"]),
  });

  app.get(
    "/teachers/me/students/:crmStudentId/monthly-plan",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => {
      const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
      const { month } = z.object({ month: monthSchema }).parse(request.query);
      return { data: await getStudentMonthlyPlan(request.user!.id, crmStudentId, month) };
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
      }).parse(request.body ?? {});
      return {
        data: await saveStudentMonthlyPlan(
          request.user!.id,
          crmStudentId,
          body.month,
          body,
        ),
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
      const { month } = z.object({ month: monthSchema }).parse(request.query);
      return { data: await getGroupMonthlyPlan(request.user!.id, crmGroupId, month) };
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
      }).parse(request.body ?? {});
      return {
        data: await saveGroupMonthlyPlan(
          request.user!.id,
          crmGroupId,
          body.month,
          body,
        ),
      };
    },
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
