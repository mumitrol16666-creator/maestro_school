import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  confirmPaymentRequest,
  countPendingPaymentRequests,
  createChildPaymentRequest,
  createPaymentRequest,
  exportPaymentRequestsCsv,
  getChildCoursePaymentView,
  getCoursePaymentView,
  getPaymentRequest,
  listChildCourses,
  listCoursesForPayments,
  listPaymentRequests,
  listStudentPaymentRequests,
  PAYMENT_MANAGE_PERMISSION,
  refundPaymentRequest,
  rejectPaymentRequest,
} from "../../application/services/course-payment.service.js";
import {
  getPaymentSettings,
  grantCourseAccess,
  listStudentCourseAccess,
  revokeCourseAccess,
  updatePaymentSettings,
} from "../../application/services/course-access-admin.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { parsePeriodStart } from "../../domain/course-payments.js";
import {
  authenticate,
  requireParent,
  requirePermission,
  requireStudent,
} from "../guards/auth.guards.js";

const uuid = z.string().uuid();
const optionalNote = z.string().trim().max(1000).optional().nullable();
const periodDate = z.string().trim().refine((value) => parsePeriodStart(value) !== null, "Некорректная дата");

const filterQuery = z.object({
  status: z.enum(["pending", "confirmed", "rejected", "refunded", "access_revoked"]).optional(),
  courseId: uuid.optional(),
  from: periodDate.optional(),
  to: periodDate.optional(),
  search: z.string().trim().max(100).optional(),
});

/** Empty string is «nothing» for the form, never an invalid link. */
const settingsField = (max: number) => z.string().trim().max(max).optional().nullable()
  .transform((value) => value || null);

const settingsBody = z.object({
  kaspiPayUrl: settingsField(1024).refine(
    (value) => value === null || /^https:\/\/\S+$/i.test(value),
    "Ссылка на оплату должна начинаться с https://",
  ),
  transferPhone: settingsField(32),
  recipientName: settingsField(255),
  hint: settingsField(2000),
});

/**
 * Stage 4: «Я оплатил», decisions and access for paid courses.
 *
 * Branch note: nothing in the platform ties an administrator or a student to a branch (a User has
 * no branch; only Teacher and Course carry a nullable branchId, and no admin action reads it),
 * so branch_manager decides on every request exactly like admin and owner.
 */
export async function coursePaymentsRoutes(app: FastifyInstance) {
  const studentGuards = [authenticate, requireStudent, requirePermission("courses.read")];
  const parentGuards = [authenticate, requireParent, requirePermission("family.read")];
  const adminGuards = [authenticate, requirePermission(PAYMENT_MANAGE_PERMISSION)];
  const childParams = z.object({ studentId: uuid });
  const childCourseParams = z.object({ studentId: uuid, courseId: uuid });
  // The payer sends the price they saw: the request is made for exactly that price or not at all.
  const noteBody = z.object({
    payerNote: z.string().trim().max(1000).optional().nullable(),
    expectedPriceKzt: z.number({ required_error: "Укажите цену курса, которую вы видите" })
      .int("Цена должна быть целым числом").positive("Цена должна быть больше нуля"),
  });

  // ── Student ──────────────────────────────────────────────────────────────────

  app.get("/courses/:courseId/access", { preHandler: studentGuards }, async (request) => {
    const { courseId } = z.object({ courseId: uuid }).parse(request.params);
    return {
      data: await getCoursePaymentView({
        studentId: request.user!.id,
        courseId,
        viewerUserId: request.user!.id,
      }),
    };
  });

  app.post("/courses/:courseId/payment-requests", { preHandler: studentGuards }, async (request, reply) => {
    const { courseId } = z.object({ courseId: uuid }).parse(request.params);
    const body = noteBody.parse(request.body ?? {});
    const { request: created } = await createPaymentRequest({
      courseId,
      studentId: request.user!.id,
      payerUserId: request.user!.id,
      payerNote: body.payerNote,
      expectedPriceKzt: body.expectedPriceKzt,
    });
    return reply.status(201).send({ data: created });
  });

  app.get("/students/me/course-payment-requests", { preHandler: studentGuards }, async (request) => ({
    data: await listStudentPaymentRequests(request.user!.id),
  }));

  // ── Parent: every route checks the link to the child first, a stranger's child is a 404 ──

  app.get("/parents/me/children/:studentId/courses", { preHandler: parentGuards }, async (request) => {
    const { studentId } = childParams.parse(request.params);
    return { data: await listChildCourses(request.user!.id, studentId) };
  });

  app.get(
    "/parents/me/children/:studentId/courses/:courseId/access",
    { preHandler: parentGuards },
    async (request) => {
      const { studentId, courseId } = childCourseParams.parse(request.params);
      return { data: await getChildCoursePaymentView(request.user!.id, studentId, courseId) };
    },
  );

  app.post(
    "/parents/me/children/:studentId/courses/:courseId/payment-requests",
    { preHandler: parentGuards },
    async (request, reply) => {
      const { studentId, courseId } = childCourseParams.parse(request.params);
      const body = noteBody.parse(request.body ?? {});
      const { request: created } = await createChildPaymentRequest({
        parentUserId: request.user!.id,
        studentId,
        courseId,
        payerNote: body.payerNote,
        expectedPriceKzt: body.expectedPriceKzt,
      });
      return reply.status(201).send({ data: created });
    },
  );

  // ── Administrator ────────────────────────────────────────────────────────────

  app.get("/admin/course-payments/requests", { preHandler: adminGuards }, async (request) => {
    const query = filterQuery.extend({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    const { page, limit, ...filters } = query;
    const result = await listPaymentRequests(filters, { page, limit });
    return {
      data: result.items,
      meta: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
    };
  });

  // The courses for the filter and for giving access: the catalog route needs `catalog.manage`,
  // which a payment administrator (branch_manager) may not have.
  app.get("/admin/course-payments/courses", { preHandler: adminGuards }, async () => ({
    data: await listCoursesForPayments(),
  }));

  app.get("/admin/course-payments/requests/pending-count", { preHandler: adminGuards }, async () => ({
    data: { count: await countPendingPaymentRequests() },
  }));

  app.get("/admin/course-payments/requests/export.csv", { preHandler: adminGuards }, async (request, reply) => {
    const filters = filterQuery.parse(request.query);
    const result = await exportPaymentRequestsCsv(filters);
    await writeAuditLog({
      entityType: "course_payment_export",
      // audit_logs.entity_id is a UUID column: an export belongs to the person who made it.
      entityId: request.user!.id,
      action: "read",
      actorId: request.user!.id,
      payload: { filters, rows: result.count },
    });
    const day = new Date().toISOString().slice(0, 10);
    // The table stops at the limit: say so, or the administrator takes an incomplete list for all.
    if (result.truncated) reply.header("X-Export-Truncated", "1");
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="course-payments-${day}.csv"`)
      .header("Cache-Control", "no-store")
      .send(result.csv);
  });

  app.get("/admin/course-payments/requests/:requestId", { preHandler: adminGuards }, async (request) => {
    const { requestId } = z.object({ requestId: uuid }).parse(request.params);
    return { data: await getPaymentRequest(requestId) };
  });

  app.post("/admin/course-payments/requests/:requestId/confirm", { preHandler: adminGuards }, async (request) => {
    const { requestId } = z.object({ requestId: uuid }).parse(request.params);
    const body = z.object({ note: optionalNote }).parse(request.body ?? {});
    return {
      data: await confirmPaymentRequest({ requestId, actorId: request.user!.id, note: body.note }),
    };
  });

  app.post("/admin/course-payments/requests/:requestId/reject", { preHandler: adminGuards }, async (request) => {
    const { requestId } = z.object({ requestId: uuid }).parse(request.params);
    const body = z.object({
      note: z.string().trim().min(3, "Укажите причину отказа").max(1000),
    }).parse(request.body ?? {});
    return {
      data: await rejectPaymentRequest({ requestId, actorId: request.user!.id, note: body.note }),
    };
  });

  app.post("/admin/course-payments/requests/:requestId/refund", { preHandler: adminGuards }, async (request) => {
    const { requestId } = z.object({ requestId: uuid }).parse(request.params);
    const body = z.object({ note: optionalNote }).parse(request.body ?? {});
    return {
      data: await refundPaymentRequest({ requestId, actorId: request.user!.id, note: body.note }),
    };
  });

  app.get("/admin/students/:studentId/course-access", { preHandler: adminGuards }, async (request) => {
    const { studentId } = childParams.parse(request.params);
    return { data: await listStudentCourseAccess(studentId) };
  });

  app.post("/admin/students/:studentId/course-access", { preHandler: adminGuards }, async (request, reply) => {
    const { studentId } = childParams.parse(request.params);
    const body = z.object({
      courseId: uuid,
      note: z.string().trim().min(3, "Укажите причину выдачи доступа").max(1000),
      expiresAt: z.coerce.date().optional().nullable(),
    }).parse(request.body ?? {});
    const access = await grantCourseAccess({
      studentId,
      courseId: body.courseId,
      actorId: request.user!.id,
      note: body.note,
      expiresAt: body.expiresAt,
    });
    return reply.status(201).send({ data: access });
  });

  app.post("/admin/course-access/:accessId/revoke", { preHandler: adminGuards }, async (request) => {
    const { accessId } = z.object({ accessId: uuid }).parse(request.params);
    const body = z.object({ note: optionalNote }).parse(request.body ?? {});
    return {
      data: await revokeCourseAccess({ accessId, actorId: request.user!.id, note: body.note }),
    };
  });

  app.get("/admin/course-payments/settings", { preHandler: adminGuards }, async () => ({
    data: await getPaymentSettings(),
  }));

  app.put("/admin/course-payments/settings", { preHandler: adminGuards }, async (request) => {
    const body = settingsBody.parse(request.body ?? {});
    return { data: await updatePaymentSettings(body, request.user!.id) };
  });
}
