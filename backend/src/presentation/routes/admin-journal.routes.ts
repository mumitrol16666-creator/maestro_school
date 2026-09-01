import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ADMIN_JOURNAL_SEVERITIES,
  ADMIN_JOURNAL_SOURCES,
  ADMIN_JOURNAL_STATUSES,
  ADMIN_JOURNAL_TYPES,
  assertCuratorWorkspaceV2Enabled,
  changeAdminJournalStatus,
  getAdminJournalEntry,
  listAdminJournal,
} from "../../application/services/admin-journal.service.js";
import {
  authenticate,
  requireOfflineCoordinator,
  requirePermission,
} from "../guards/auth.guards.js";

async function requireCuratorWorkspaceV2(_request: FastifyRequest) {
  assertCuratorWorkspaceV2Enabled();
}

const readGuards = [
  authenticate,
  requireOfflineCoordinator,
  requirePermission("offline_school.read"),
  requireCuratorWorkspaceV2,
];
const writeGuards = [
  authenticate,
  requireOfflineCoordinator,
  requirePermission("offline_school.write"),
  requireCuratorWorkspaceV2,
];

export async function adminJournalRoutes(app: FastifyInstance) {
  app.get("/admin/journal", { preHandler: readGuards }, async (request) => {
    const query = z.object({
      type: z.enum(ADMIN_JOURNAL_TYPES).optional(),
      severity: z.enum(ADMIN_JOURNAL_SEVERITIES).optional(),
      source: z.enum(ADMIN_JOURNAL_SOURCES).optional(),
      status: z.enum(ADMIN_JOURNAL_STATUSES).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    return { data: await listAdminJournal(query) };
  });

  app.get("/admin/journal/:entryId", { preHandler: readGuards }, async (request) => {
    const { entryId } = z.object({ entryId: z.string().uuid() }).parse(request.params);
    return { data: await getAdminJournalEntry(entryId) };
  });

  app.patch("/admin/journal/:entryId/status", { preHandler: writeGuards }, async (request) => {
    const { entryId } = z.object({ entryId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      status: z.enum(ADMIN_JOURNAL_STATUSES),
      resolution: z.string().trim().min(3).max(5000).optional().nullable(),
      idempotencyKey: z.string().trim().min(8).max(191),
    }).parse(request.body ?? {});
    return {
      data: await changeAdminJournalStatus({
        entryId,
        status: body.status,
        resolution: body.resolution,
        idempotencyKey: body.idempotencyKey,
        actorId: request.user!.id,
      }),
    };
  });
}
