import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  applyUserLink,
  getUserLinkStatus,
  findUserByCrmStudentId,
  findUserByCrmTeacherId,
  findUserByAppUserId,
} from "../../application/repositories/user-link.repository.js";
import { findUserWithRoleById, updateUserPassword } from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { requireIntegrationAuth } from "../guards/integration.guards.js";
import { exchangeSsoBridgeToken } from "../../application/services/sso-bridge.service.js";
import { provisionTeacherFromCrm } from "../../application/services/teacher-provision.service.js";
import { provisionStudentFromCrm } from "../../application/services/student-provision.service.js";
import { syncOnlineLessonFromCrm } from "../../application/services/online-lessons.service.js";
import {
  notifyOfflineLessonApproved,
  notifyOfflineLessonEvent,
} from "../../application/services/notification.service.js";
import { generateWhatsappHomeworkDrafts } from "../../application/services/whatsapp-homework-message.service.js";

const linkSchema = z.object({
  phone: z.string().optional(),
  phoneNormalized: z.string().min(10).max(32),
  crmStudentId: z.string().optional(),
  crmTeacherId: z.string().optional(),
  appUserId: z.string().uuid().optional(),
  initiatedBy: z.enum(["crm", "learning-platform"]).optional(),
  crmRole: z.string().optional(),
});

const ssoExchangeSchema = z.object({
  token: z.string().min(10),
});

const provisionTeacherSchema = z.object({
  crmTeacherId: z.string().min(1).max(64),
  phone: z.string().min(10).max(32),
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  middleName: z.string().trim().max(128).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
  bio: z.string().max(5000).optional().nullable(),
});

const provisionStudentSchema = z.object({
  crmStudentId: z.string().min(1).max(64),
  phone: z.string().min(10).max(32),
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().max(128).optional().nullable(),
  middleName: z.string().trim().max(128).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  password: z.string().min(4).max(72).optional().nullable(),
});

const updatePasswordSchema = z.object({
  appUserId: z.string().uuid().optional(),
  crmStudentId: z.string().optional(),
  crmTeacherId: z.string().optional(),
  password: z.string().min(4).max(72),
});

const onlineLessonSyncSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("schedule"),
    crmTeacherId: z.string().min(1).max(64),
    scheduledAt: z.coerce.date(),
    meetingUrl: z.string().trim().url().max(1024),
  }),
  z.object({ action: z.literal("cancel") }),
]);

const offlineLessonApprovedSchema = z.object({
  crmClassId: z.string().min(1).max(128),
  crmTeacherId: z.string().min(1).max(64),
  crmStudentIds: z.array(z.string().min(1).max(64)).max(100).optional(),
  lessonTitle: z.string().trim().max(500).optional().nullable(),
  date: z.string().trim().max(64).optional().nullable(),
  startTime: z.string().trim().max(32).optional().nullable(),
});

const offlineLessonEventSchema = offlineLessonApprovedSchema.extend({
  crmTeacherId: z.string().min(1).max(64).optional(),
  event: z.enum(["returned", "cancelled", "rescheduled"]),
  message: z.string().trim().max(2000).optional().nullable(),
});

const whatsappHomeworkDraftSchema = z.object({
  crmClassId: z.string().min(1).max(128),
});

function integrationProfile(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithRoleById>>>,
) {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName,
    phone: user.phone,
    role: user.role.slug,
    crmStudentId: user.crmStudentId,
    crmTeacherId: user.crmTeacherId,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
  };
}

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireIntegrationAuth);

  app.post("/users/link", async (request, reply) => {
    const body = linkSchema.parse(request.body);
    const result = await applyUserLink(body);

    if (!result.success) {
      if (result.status === "conflict") {
        throw new ConflictError(result.error);
      }
      throw new BadRequestError(result.error);
    }

    return reply.send({ success: true, data: result.data });
  });

  app.get("/users/link-status/:phone", async (request) => {
    const { phone } = request.params as { phone: string };
    const result = await getUserLinkStatus(phone);
    return { success: true, data: result.data };
  });

  app.post("/users/provision-teacher", async (request, reply) => {
    const body = provisionTeacherSchema.parse(request.body);
    const result = await provisionTeacherFromCrm(body);
    return reply.status(result.created ? 201 : 200).send({ success: true, data: result });
  });

  app.post("/users/provision-student", async (request, reply) => {
    const body = provisionStudentSchema.parse(request.body);
    const result = await provisionStudentFromCrm({
      ...body,
      lastName: body.lastName?.trim() || "",
      middleName: body.middleName?.trim() || null,
    });
    return reply.status(result.created ? 201 : 200).send({ success: true, data: result });
  });

  app.post("/users/update-password", async (request, reply) => {
    const { appUserId, crmStudentId, crmTeacherId, password } = updatePasswordSchema.parse(request.body);

    let user = null;
    if (appUserId) {
      user = await findUserByAppUserId(appUserId);
    } else if (crmStudentId) {
      user = await findUserByCrmStudentId(crmStudentId);
    } else if (crmTeacherId) {
      user = await findUserByCrmTeacherId(crmTeacherId);
    }

    if (!user) {
      throw new BadRequestError("Пользователь не найден в Learning Platform");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await updateUserPassword(user.id, passwordHash);

    return { success: true, message: "Пароль успешно синхронизирован" };
  });

  app.post("/online-lessons/:requestId/sync", async (request) => {
    const { requestId } = z.object({ requestId: z.string().uuid() }).parse(request.params);
    const body = onlineLessonSyncSchema.parse(request.body);
    return {
      success: true,
      data: await syncOnlineLessonFromCrm(requestId, body),
    };
  });

  app.post("/notifications/offline-lesson-approved", async (request) => {
    const body = offlineLessonApprovedSchema.parse(request.body);
    return {
      success: true,
      data: await notifyOfflineLessonApproved(body),
    };
  });

  app.post("/notifications/offline-lesson-event", async (request) => {
    const body = offlineLessonEventSchema.parse(request.body);
    return {
      success: true,
      data: await notifyOfflineLessonEvent(body),
    };
  });

  app.post("/whatsapp/homework-drafts", async (request) => {
    const { crmClassId } = whatsappHomeworkDraftSchema.parse(request.body);
    return {
      success: true,
      data: {
        drafts: await generateWhatsappHomeworkDrafts(crmClassId),
      },
    };
  });

  app.post("/auth/sso-exchange", async (request, reply) => {
    const { token } = ssoExchangeSchema.parse(request.body);
    const { user, crmStudentId } = await exchangeSsoBridgeToken(token);
    const sessionToken = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return {
      success: true,
      data: {
        token: sessionToken,
        user: integrationProfile(user),
        crmStudentId,
      },
    };
  });
}
