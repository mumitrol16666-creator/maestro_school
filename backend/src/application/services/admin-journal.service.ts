import { Prisma } from "@prisma/client";
import { productFeatureConfig } from "../../config/product-features.js";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export const ADMIN_JOURNAL_TYPES = [
  "product_improvement",
  "complaint",
  "moderation",
  "crm_sync",
  "stuck_homework",
  "stuck_report",
  "reward_correction",
  "parent_access",
] as const;
export const ADMIN_JOURNAL_SEVERITIES = ["low", "normal", "high", "critical"] as const;
export const ADMIN_JOURNAL_STATUSES = ["new", "in_progress", "resolved", "dismissed"] as const;
export const ADMIN_JOURNAL_SOURCES = ["application", "crm", "system", "moderation"] as const;

export type AdminJournalType = typeof ADMIN_JOURNAL_TYPES[number];
export type AdminJournalSeverity = typeof ADMIN_JOURNAL_SEVERITIES[number];
export type AdminJournalStatus = typeof ADMIN_JOURNAL_STATUSES[number];
export type AdminJournalSource = typeof ADMIN_JOURNAL_SOURCES[number];

const severityRank: Record<AdminJournalSeverity, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

const legacyJournalCopy: Record<string, string> = {
  "CRM-событие ожидает повторной доставки": "Данные ещё не переданы",
  "Конфликт синхронизации CRM": "Данные расходятся с расписанием",
  "Конфликт синхронизации посещаемости": "Не удалось обновить посещаемость",
  "CRM отклонила новую версию отметки посещаемости. Требуется решение администратора.":
    "Новая отметка посещаемости не принята. Администратору нужно выбрать верные данные.",
  "Отчёт урока не доставлен. Автоматическая повторная попытка сохранена.":
    "Отчёт урока ещё не передан. Повторная отправка произойдёт автоматически.",
  "Администратор выдал родителю read-only доступ к учебному профилю ученика.":
    "Администратор открыл родителю доступ к учебному профилю ученика.",
  "Новый родительский профиль создан и получил read-only доступ к ученику.":
    "Новый родительский профиль создан и получил доступ к данным ученика.",
  "Существующий родительский профиль получил read-only доступ к ученику.":
    "Существующий родительский профиль получил доступ к данным ученика.",
  "Read-only доступ родительского профиля к ученику отключён.":
    "Доступ родительского профиля к данным ученика отключён.",
};

function visibleJournalCopy(value: string) {
  return legacyJournalCopy[value] ?? value;
}

const actorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  login: true,
} as const;

const entryInclude = Prisma.validator<Prisma.AdminJournalEntryInclude>()({
  actions: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { actor: { select: actorSelect } },
  },
});

type JournalEntryWithActions = Prisma.AdminJournalEntryGetPayload<{
  include: typeof entryInclude;
}>;
type DbClient = Prisma.TransactionClient | typeof prisma;

function inputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function actorView(actor: JournalEntryWithActions["actions"][number]["actor"]) {
  if (!actor) return null;
  return {
    id: actor.id,
    displayName: formatFio(actor) || actor.login || "Администратор Maestro",
  };
}

function entryView(entry: JournalEntryWithActions, now = new Date()) {
  return {
    id: entry.id,
    sourceKey: entry.sourceKey,
    type: entry.type as AdminJournalType,
    severity: entry.severity as AdminJournalSeverity,
    source: entry.source as AdminJournalSource,
    linkedEntity: {
      type: entry.linkedEntityType,
      id: entry.linkedEntityId,
    },
    title: visibleJournalCopy(entry.title),
    summary: visibleJournalCopy(entry.summary),
    status: entry.status as AdminJournalStatus,
    resolution: entry.resolution,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ageMinutes: Math.max(0, Math.floor((now.getTime() - entry.createdAt.getTime()) / 60_000)),
    actions: entry.actions.map((action) => ({
      id: action.id,
      action: action.action,
      fromStatus: action.fromStatus as AdminJournalStatus | null,
      toStatus: action.toStatus as AdminJournalStatus | null,
      note: action.note,
      actor: actorView(action.actor),
      createdAt: action.createdAt,
    })),
  };
}

export function curatorWorkspaceV2Enabled() {
  return productFeatureConfig.flags.curatorWorkspaceV2;
}

export function assertCuratorWorkspaceV2Enabled() {
  if (!curatorWorkspaceV2Enabled()) {
    throw new NotFoundError("Admin journal");
  }
}

export async function upsertAdminJournalEntry(params: {
  sourceKey: string;
  type: AdminJournalType;
  severity: AdminJournalSeverity;
  source: AdminJournalSource;
  linkedEntityType: string;
  linkedEntityId: string;
  title: string;
  summary: string;
  actorId?: string | null;
  initialStatus?: AdminJournalStatus;
  resolution?: string | null;
  payload?: unknown;
}, db: DbClient = prisma) {
  const initialStatus = params.initialStatus ?? "new";
  const resolution = params.resolution?.trim() || null;
  if (["resolved", "dismissed"].includes(initialStatus) && !resolution) {
    throw new BadRequestError("Для закрытой записи укажите решение", "ADMIN_JOURNAL_RESOLUTION_REQUIRED");
  }

  const execute = async (tx: Prisma.TransactionClient) => {
    const entry = await tx.adminJournalEntry.upsert({
      where: { sourceKey: params.sourceKey },
      create: {
        sourceKey: params.sourceKey,
        type: params.type,
        severity: params.severity,
        severityRank: severityRank[params.severity],
        source: params.source,
        linkedEntityType: params.linkedEntityType,
        linkedEntityId: params.linkedEntityId,
        title: params.title,
        summary: params.summary,
        status: initialStatus,
        resolution,
      },
      update: {
        type: params.type,
        severity: params.severity,
        severityRank: severityRank[params.severity],
        source: params.source,
        linkedEntityType: params.linkedEntityType,
        linkedEntityId: params.linkedEntityId,
        title: params.title,
        summary: params.summary,
      },
    });

    await tx.adminJournalAction.upsert({
      where: { actionKey: `${params.sourceKey}:created` },
      create: {
        actionKey: `${params.sourceKey}:created`,
        entryId: entry.id,
        action: "created",
        toStatus: initialStatus,
        note: resolution,
        actorId: params.actorId ?? null,
        payload: params.payload === undefined ? undefined : inputJson(params.payload),
      },
      update: {},
    });

    return entry;
  };
  return db === prisma ? prisma.$transaction(execute) : execute(db);
}

export async function listAdminJournal(params: {
  type?: AdminJournalType;
  severity?: AdminJournalSeverity;
  source?: AdminJournalSource;
  status?: AdminJournalStatus;
  limit?: number;
  now?: Date;
} = {}) {
  const where: Prisma.AdminJournalEntryWhereInput = {
    ...(params.type ? { type: params.type } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(params.source ? { source: params.source } : {}),
    ...(params.status ? { status: params.status } : {}),
  };
  const aggregateWhere: Prisma.AdminJournalEntryWhereInput = {
    ...(params.type ? { type: params.type } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(params.source ? { source: params.source } : {}),
  };
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const [entries, groupedStatuses, total] = await Promise.all([
    prisma.adminJournalEntry.findMany({
      where,
      orderBy: [
        { severityRank: "desc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: limit,
      include: entryInclude,
    }),
    prisma.adminJournalEntry.groupBy({
      by: ["status"],
      where: aggregateWhere,
      _count: { _all: true },
    }),
    prisma.adminJournalEntry.count({ where }),
  ]);
  const counts = Object.fromEntries(ADMIN_JOURNAL_STATUSES.map((status) => [status, 0])) as Record<AdminJournalStatus, number>;
  for (const group of groupedStatuses) {
    if (ADMIN_JOURNAL_STATUSES.includes(group.status as AdminJournalStatus)) {
      counts[group.status as AdminJournalStatus] = group._count._all;
    }
  }
  return {
    items: entries.map((entry) => entryView(entry, params.now)),
    total,
    counts,
    generatedAt: params.now ?? new Date(),
  };
}

export async function getAdminJournalEntry(entryId: string) {
  const entry = await prisma.adminJournalEntry.findUnique({
    where: { id: entryId },
    include: entryInclude,
  });
  if (!entry) throw new NotFoundError("Journal entry");
  return entryView(entry);
}

export async function changeAdminJournalStatus(params: {
  entryId: string;
  status: AdminJournalStatus;
  actorId?: string | null;
  resolution?: string | null;
  idempotencyKey: string;
  action?: "status_changed" | "auto_resolved";
  payload?: unknown;
}) {
  const resolution = params.resolution?.trim() || null;
  if (["resolved", "dismissed"].includes(params.status) && !resolution) {
    throw new BadRequestError("Укажите решение перед закрытием записи", "ADMIN_JOURNAL_RESOLUTION_REQUIRED");
  }

  await prisma.$transaction(async (tx) => {
    const existingAction = await tx.adminJournalAction.findUnique({
      where: { actionKey: params.idempotencyKey },
      select: { id: true },
    });
    if (existingAction) return;

    const entry = await tx.adminJournalEntry.findUnique({
      where: { id: params.entryId },
      select: { id: true, status: true },
    });
    if (!entry) throw new NotFoundError("Journal entry");
    if (entry.status === params.status) {
      throw new BadRequestError("Запись уже находится в выбранном статусе", "ADMIN_JOURNAL_STATUS_UNCHANGED");
    }

    await tx.adminJournalEntry.update({
      where: { id: entry.id },
      data: {
        status: params.status,
        resolution: ["resolved", "dismissed"].includes(params.status) ? resolution : null,
      },
    });
    await tx.adminJournalAction.create({
      data: {
        actionKey: params.idempotencyKey,
        entryId: entry.id,
        action: params.action ?? "status_changed",
        fromStatus: entry.status,
        toStatus: params.status,
        note: resolution,
        actorId: params.actorId ?? null,
        payload: params.payload === undefined ? undefined : inputJson(params.payload),
      },
    });
  });

  return getAdminJournalEntry(params.entryId);
}

export async function resolveAdminJournalEntryBySource(params: {
  sourceKey: string;
  resolution: string;
  actionKey: string;
  payload?: unknown;
}) {
  const entry = await prisma.adminJournalEntry.findUnique({
    where: { sourceKey: params.sourceKey },
    select: { id: true, status: true },
  });
  if (!entry || entry.status === "resolved") return entry;
  return changeAdminJournalStatus({
    entryId: entry.id,
    status: "resolved",
    resolution: params.resolution,
    idempotencyKey: params.actionKey,
    action: "auto_resolved",
    payload: params.payload,
  });
}
