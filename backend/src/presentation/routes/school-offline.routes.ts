import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getStudentSchoolOfflineSummary } from "../../application/services/school-offline.service.js";
import {
  getPublishedMonthlyPlansForStudent,
  getStudentHome,
} from "../../application/services/student-home.service.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { authenticate, requirePermission, requireStudent } from "../guards/auth.guards.js";

export async function schoolOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/home",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({ data: await getStudentHome(request.user!.id) }),
  );

  app.get(
    "/students/me/monthly-plans",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => {
      const { month } = z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      }).parse(request.query ?? {});
      const requestedMonth = month ?? aqtobeMonthKey();
      return {
        data: {
          month: requestedMonth,
          plans: await getPublishedMonthlyPlansForStudent(request.user!.id, requestedMonth),
        },
      };
    },
  );

  app.get(
    "/students/me/offline-summary",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({
      data: await getStudentSchoolOfflineSummary(request.user!.id),
    }),
  );
}
