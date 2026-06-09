import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";

export async function writeAuditLog(params: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId ?? null,
      payload: params.payload,
    },
  });
}
