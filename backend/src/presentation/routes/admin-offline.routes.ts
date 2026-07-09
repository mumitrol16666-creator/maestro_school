import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  adminOfflineApprove,
  adminOfflineReopen,
  adminOfflineReturn,
  adminOfflineSetAttendance,
  getAdminOfflineClass,
  getAdminOfflineAgenda,
  getAdminOfflineClassStudents,
  getPendingReviewAgenda,
} from "../../application/services/admin-offline.service.js";
import { authenticate, requireContentAdmin, requirePermission } from "../guards/auth.guards.js";

const readGuards = [authenticate, requireContentAdmin, requirePermission("offline_school.read")];
const writeGuards = [authenticate, requireContentAdmin, requirePermission("offline_school.write")];

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
      const body = z.object({
        studentId: z.string().min(1),
        attended: z.boolean().optional(),
        attendanceStatus: z.enum(["unmarked", "present", "late", "excused_absence", "unexcused_absence"]),
        teacherNote: z.string().max(3000).optional(),
      }).parse(request.body ?? {});
      return {
        data: await adminOfflineSetAttendance(
          crmClassId,
          body.studentId,
          body.attendanceStatus,
          body.teacherNote,
        ),
      };
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
}
