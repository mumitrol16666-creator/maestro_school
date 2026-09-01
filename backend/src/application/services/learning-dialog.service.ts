import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { productFeatureConfig } from "../../config/product-features.js";
import {
  assertCanChangeLearningMessage,
  assertCanSendLearningMessage,
  isLearningDialogCuratorRole,
  validateLearningDialogAttachments,
} from "../../domain/learning-dialog-policy.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { upsertAdminJournalEntry } from "./admin-journal.service.js";
import {
  getLearningDialogFile,
  type StoredLearningDialogFile,
} from "./learning-dialog-private-storage.service.js";
import { deliverUserNotification } from "./notification.service.js";

type DialogActor = {
  userId: string;
  roleSlug: string;
};

type MessageContext = {
  contextType?: string | null;
  contextId?: string | null;
};

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  middleName: true,
  avatar: true,
} satisfies Prisma.UserSelect;

const conversationAccessInclude = {
  members: {
    include: { user: { select: personSelect } },
    orderBy: { joinedAt: "asc" as const },
  },
} satisfies Prisma.LearningConversationInclude;

function digest(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function assertLearningDialogsEnabled() {
  if (!productFeatureConfig.flags.learningDialogsV2) {
    throw new ConflictError("Новый контур диалогов выключен", "LEARNING_DIALOGS_V2_DISABLED");
  }
}

function assertDialogRole(roleSlug: string) {
  if (roleSlug === "student" || roleSlug === "teacher" || roleSlug === "parent"
    || isLearningDialogCuratorRole(roleSlug)) {
    return;
  }
  throw new ForbiddenError("Учебные диалоги недоступны для этой роли");
}

function personName(person: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ").trim();
}

function actorMember<T extends { userId: string }>(members: T[], userId: string) {
  return members.find((member) => member.userId === userId) ?? null;
}

function canActorWrite(
  conversation: {
    type: "learning_direction" | "parent_teacher" | "curator" | "crm_group";
    status: "active" | "read_only" | "closed";
  },
  member: {
    canWrite: boolean;
    leftAt: Date | null;
    restrictedUntil: Date | null;
  } | null,
  curator: boolean,
  now = new Date(),
) {
  if (curator && conversation.type === "curator" && conversation.status === "active") return true;
  if (!member || member.leftAt || !member.canWrite || conversation.status !== "active") return false;
  return !member.restrictedUntil || member.restrictedUntil.getTime() <= now.getTime();
}

function latestBody(message: {
  state: "visible" | "retracted" | "hidden";
  versions: Array<{ body: string | null }>;
}) {
  return message.state === "visible" ? message.versions[0]?.body ?? null : null;
}

function attachmentView(attachment: {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string;
  quarantineStatus: string;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: Number(attachment.sizeBytes),
    sha256: attachment.sha256,
    quarantineStatus: attachment.quarantineStatus,
    downloadUrl: `/api/v1/learning-dialog-attachments/${attachment.id}/download`,
    createdAt: attachment.createdAt,
  };
}

function assertModerator(actor: DialogActor) {
  if (!isLearningDialogCuratorRole(actor.roleSlug)) {
    throw new ForbiddenError("Модерация доступна только администратору");
  }
}

function moderationReason(value: string, field = "Укажите причину") {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestError(field);
  if (normalized.length > 2000) throw new BadRequestError("Причина слишком длинная");
  return normalized;
}

function inputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function conversationWhere(
  actor: DialogActor,
  archive: "active" | "archived" | "all" = "active",
): Prisma.LearningConversationWhereInput {
  const archiveFilter = archive === "all"
    ? {}
    : {
        members: archive === "archived"
          ? { some: { userId: actor.userId, archivedAt: { not: null } } }
          : isLearningDialogCuratorRole(actor.roleSlug)
            ? { none: { userId: actor.userId, archivedAt: { not: null } } }
            : { some: { userId: actor.userId, archivedAt: null } },
      };
  return isLearningDialogCuratorRole(actor.roleSlug)
    ? archiveFilter
    : {
        AND: [
          { members: { some: { userId: actor.userId } } },
          archiveFilter,
        ],
      };
}

async function requireConversationAccess(
  tx: Prisma.TransactionClient,
  actor: DialogActor,
  conversationId: string,
) {
  assertDialogRole(actor.roleSlug);
  const conversation = await tx.learningConversation.findUnique({
    where: { id: conversationId },
    include: conversationAccessInclude,
  });
  const curator = isLearningDialogCuratorRole(actor.roleSlug);
  if (!conversation || (!curator && !actorMember(conversation.members, actor.userId))) {
    throw new NotFoundError("Learning conversation");
  }
  return { conversation, curator };
}

async function appendCuratorMembershipEvent(
  tx: Prisma.TransactionClient,
  params: {
    conversationId: string;
    memberId: string;
    userId: string;
    occurredAt: Date;
  },
) {
  await tx.learningConversationMembershipEvent.upsert({
    where: { sourceKey: `dialog-api:curator-member:${params.conversationId}:${params.userId}` },
    create: {
      sourceKey: `dialog-api:curator-member:${params.conversationId}:${params.userId}`,
      conversationId: params.conversationId,
      memberId: params.memberId,
      userId: params.userId,
      event: "joined",
      source: "dialog_api",
      occurredAt: params.occurredAt,
    },
    update: {},
  });
}

async function ensureImplicitCuratorMembership(
  tx: Prisma.TransactionClient,
  conversation: {
    id: string;
    type: "learning_direction" | "parent_teacher" | "curator" | "crm_group";
  },
  actor: DialogActor,
  now: Date,
) {
  const existing = await tx.learningConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: actor.userId,
      },
    },
    include: { user: { select: personSelect } },
  });
  if (existing) return existing;

  const member = await tx.learningConversationMember.create({
    data: {
      conversationId: conversation.id,
      userId: actor.userId,
      role: "curator",
      canWrite: conversation.type === "curator",
      joinedAt: now,
    },
    include: { user: { select: personSelect } },
  });
  await appendCuratorMembershipEvent(tx, {
    conversationId: conversation.id,
    memberId: member.id,
    userId: actor.userId,
    occurredAt: now,
  });
  return member;
}

async function requireSendAccess(
  tx: Prisma.TransactionClient,
  actor: DialogActor,
  conversationId: string,
  now: Date,
) {
  const { conversation, curator } = await requireConversationAccess(tx, actor, conversationId);
  let member = actorMember(conversation.members, actor.userId);
  if (curator) {
    member = await ensureImplicitCuratorMembership(tx, conversation, actor, now);
    if (conversation.type !== "curator") {
      throw new ForbiddenError("Администратор участвует в учебных и групповых диалогах только как модератор");
    }
  }
  assertCanSendLearningMessage({
    status: conversation.status,
    isMember: Boolean(member),
    canWrite: member?.canWrite ?? false,
    leftAt: member?.leftAt,
    restrictedUntil: member?.restrictedUntil,
  }, now);
  return { conversation, member: member! };
}

function serializeMembers(members: Array<{
  role: "student" | "teacher" | "parent" | "curator";
  canWrite: boolean;
  restrictedUntil: Date | null;
  restrictionReason: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    avatar: string | null;
  };
}>) {
  return members.map((member) => ({
    userId: member.user.id,
    name: personName(member.user),
    avatar: member.user.avatar,
    role: member.role,
    canWrite: member.canWrite,
    restrictedUntil: member.restrictedUntil,
    restrictionReason: member.restrictionReason,
    joinedAt: member.joinedAt,
    leftAt: member.leftAt,
  }));
}

type ConversationCounterRow = {
  conversationId: string;
  unreadCount: bigint;
  openReportCount: bigint;
};

async function conversationCounters(
  conversations: Array<{ id: string; members: Array<{ userId?: string; lastReadAt: Date | null }> }>,
  actor: DialogActor,
) {
  if (!conversations.length) return new Map<string, { unreadCount: number; openReportCount: number }>();
  const thresholds = Prisma.join(conversations.map((conversation) => {
    const member = conversation.members.find((item) => !item.userId || item.userId === actor.userId) ?? null;
    return Prisma.sql`(${conversation.id}::uuid, ${member?.lastReadAt ?? null}::timestamptz)`;
  }));
  const includeReports = isLearningDialogCuratorRole(actor.roleSlug);
  const rows = await prisma.$queryRaw<ConversationCounterRow[]>(Prisma.sql`
    WITH thresholds("conversationId", "lastReadAt") AS (
      VALUES ${thresholds}
    )
    SELECT
      thresholds."conversationId" AS "conversationId",
      (
        SELECT COUNT(*)
        FROM "learning_messages" AS message
        WHERE message."conversation_id" = thresholds."conversationId"
          AND message."author_id" IS NOT NULL
          AND message."author_id" <> ${actor.userId}::uuid
          AND (thresholds."lastReadAt" IS NULL OR message."created_at" > thresholds."lastReadAt")
      ) AS "unreadCount",
      CASE WHEN ${includeReports} THEN (
        SELECT COUNT(*)
        FROM "learning_message_reports" AS report
        INNER JOIN "learning_messages" AS message ON message."id" = report."message_id"
        WHERE message."conversation_id" = thresholds."conversationId"
          AND report."status" = 'open'
      ) ELSE 0 END AS "openReportCount"
    FROM thresholds
  `);
  return new Map(rows.map((row) => [row.conversationId, {
    unreadCount: Number(row.unreadCount),
    openReportCount: Number(row.openReportCount),
  }]));
}

export async function listLearningConversations(
  actor: DialogActor,
  input: { limit: number; archive?: "active" | "archived" | "all" },
) {
  assertLearningDialogsEnabled();
  assertDialogRole(actor.roleSlug);
  const conversations = await prisma.learningConversation.findMany({
    where: conversationWhere(actor, input.archive),
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: input.limit,
    include: {
      ...conversationAccessInclude,
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        include: {
          versions: { orderBy: { version: "desc" }, take: 1 },
          attachments: {
            where: { deletedAt: null, quarantineStatus: "clean" },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  const counters = await conversationCounters(conversations, actor);

  return conversations.map((conversation) => {
    const member = actorMember(conversation.members, actor.userId);
    const lastMessage = conversation.messages[0] ?? null;
    const counter = counters.get(conversation.id) ?? { unreadCount: 0, openReportCount: 0 };
    return {
      id: conversation.id,
      type: conversation.type,
      status: conversation.status,
      title: conversation.title,
      crmDirectionId: conversation.crmDirectionId,
      crmGroupId: conversation.crmGroupId,
      members: serializeMembers(conversation.members),
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        authorId: lastMessage.authorId,
        body: latestBody(lastMessage),
        attachments: lastMessage.state === "visible" || isLearningDialogCuratorRole(actor.roleSlug)
          ? lastMessage.attachments.map(attachmentView)
          : [],
        state: lastMessage.state,
        editedAt: lastMessage.editedAt,
        createdAt: lastMessage.createdAt,
      } : null,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: counter.unreadCount,
      canWrite: canActorWrite(
        conversation,
        member,
        isLearningDialogCuratorRole(actor.roleSlug),
      ),
      notificationsMuted: member?.notificationsMuted ?? false,
      archivedAt: member?.archivedAt ?? null,
      openReportCount: counter.openReportCount,
    };
  });
}

export async function countUnreadLearningMessages(actor: DialogActor) {
  assertLearningDialogsEnabled();
  assertDialogRole(actor.roleSlug);
  const conversations = await prisma.learningConversation.findMany({
    where: conversationWhere(actor, "active"),
    select: {
      id: true,
      members: {
        where: { userId: actor.userId },
        select: { lastReadAt: true },
      },
    },
  });
  const counters = await conversationCounters(conversations, actor);
  return [...counters.values()].reduce((total, counter) => total + counter.unreadCount, 0);
}

export async function getLearningConversation(
  actor: DialogActor,
  conversationId: string,
  input: { limit: number; before?: string },
) {
  assertLearningDialogsEnabled();
  const { conversation, curator } = await prisma.$transaction((tx) => (
    requireConversationAccess(tx, actor, conversationId)
  ));
  const member = actorMember(conversation.members, actor.userId);
  const before = input.before
    ? await prisma.learningMessage.findFirst({
        where: { id: input.before, conversationId },
        select: { id: true, createdAt: true },
      })
    : null;
  if (input.before && !before) throw new BadRequestError("Некорректный курсор сообщений");

  const rows = await prisma.learningMessage.findMany({
    where: {
      conversationId,
      ...(before ? {
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } },
        ],
      } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit,
    include: {
      author: { select: personSelect },
      versions: { orderBy: { version: "desc" } },
      attachments: {
        where: { deletedAt: null, quarantineStatus: "clean" },
        orderBy: { createdAt: "asc" },
      },
      reports: {
        orderBy: { createdAt: "asc" },
        include: { reporter: { select: personSelect } },
      },
    },
  });
  const messages = rows.reverse().map((message) => ({
    id: message.id,
    authorId: message.authorId,
    authorName: message.author ? personName(message.author) : null,
    mine: message.authorId === actor.userId,
    body: latestBody(message),
    currentVersionId: message.versions[0]?.id ?? null,
    state: message.state,
    contextType: message.contextType,
    contextId: message.contextId,
    editedAt: message.editedAt,
    retractedAt: message.retractedAt,
    createdAt: message.createdAt,
    attachments: message.state === "visible" || curator ? message.attachments.map(attachmentView) : [],
    reports: curator ? message.reports.map((report) => ({
      id: report.id,
      versionId: report.versionId,
      reporterId: report.reporterId,
      reporterName: report.reporter ? personName(report.reporter) : null,
      reason: report.reason,
      status: report.status,
      resolution: report.resolution,
      resolvedById: report.resolvedById,
      resolvedAt: report.resolvedAt,
      createdAt: report.createdAt,
    })) : undefined,
    versions: curator ? message.versions.map((version) => ({
      id: version.id,
      version: version.version,
      kind: version.kind,
      body: version.body,
      createdById: version.createdById,
      createdAt: version.createdAt,
    })) : undefined,
  }));

  return {
    id: conversation.id,
    type: conversation.type,
    status: conversation.status,
    title: conversation.title,
    crmDirectionId: conversation.crmDirectionId,
    crmGroupId: conversation.crmGroupId,
    members: serializeMembers(conversation.members),
    canWrite: canActorWrite(conversation, member, curator),
    notificationsMuted: member?.notificationsMuted ?? false,
    archivedAt: member?.archivedAt ?? null,
    messages,
    moderationActions: curator
      ? await prisma.learningConversationModerationAction.findMany({
          where: { conversationId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : undefined,
    nextCursor: rows.length === input.limit ? rows[0]?.id ?? null : null,
  };
}

export async function updateLearningConversationPreferences(
  actor: DialogActor,
  conversationId: string,
  input: { notificationsMuted?: boolean; archived?: boolean },
) {
  assertLearningDialogsEnabled();
  if (input.notificationsMuted === undefined && input.archived === undefined) {
    throw new BadRequestError("Выберите настройку диалога");
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const { conversation, curator } = await requireConversationAccess(tx, actor, conversationId);
    let member = actorMember(conversation.members, actor.userId);
    if (!member && curator) {
      member = await ensureImplicitCuratorMembership(tx, conversation, actor, now);
    }
    if (!member) throw new NotFoundError("Learning conversation member");
    const updated = await tx.learningConversationMember.update({
      where: { id: member.id },
      data: {
        ...(input.notificationsMuted === undefined
          ? {}
          : { notificationsMuted: input.notificationsMuted }),
        ...(input.archived === undefined
          ? {}
          : { archivedAt: input.archived ? now : null }),
      },
    });
    return {
      conversationId,
      notificationsMuted: updated.notificationsMuted,
      archivedAt: updated.archivedAt,
    };
  });
}

export async function markLearningConversationRead(
  actor: DialogActor,
  conversationId: string,
) {
  assertLearningDialogsEnabled();
  const readAt = new Date();
  return prisma.$transaction(async (tx) => {
    const { conversation, curator } = await requireConversationAccess(tx, actor, conversationId);
    let member = actorMember(conversation.members, actor.userId);
    if (!member && curator) {
      member = await ensureImplicitCuratorMembership(tx, conversation, actor, readAt);
    }
    if (!member) throw new NotFoundError("Learning conversation member");
    await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: readAt },
    });
    return { conversationId, readAt };
  });
}

function validateMessageBody(body: string) {
  const normalized = body.trim();
  if (!normalized) throw new BadRequestError("Напишите сообщение");
  if (normalized.length > 4000) throw new BadRequestError("Сообщение слишком длинное");
  return normalized;
}

function validateMessageContent(body: string | undefined, attachmentCount: number) {
  const normalized = body?.trim() ?? "";
  if (!normalized && attachmentCount === 0) throw new BadRequestError("Напишите сообщение или прикрепите файл");
  if (normalized.length > 4000) throw new BadRequestError("Сообщение слишком длинное");
  return normalized || null;
}

function apiMessageSourceKey(conversationId: string, actorId: string, idempotencyKey: string) {
  return `api:learning-message:${digest([conversationId, actorId, idempotencyKey])}`;
}

async function loadMessageResult(tx: Prisma.TransactionClient, messageId: string) {
  const message = await tx.learningMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      attachments: {
        where: { deletedAt: null, quarantineStatus: "clean" },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    body: latestBody(message),
    currentVersionId: message.versions[0]?.id ?? null,
    state: message.state,
    contextType: message.contextType,
    contextId: message.contextId,
    editedAt: message.editedAt,
    retractedAt: message.retractedAt,
    attachments: message.attachments.map(attachmentView),
    createdAt: message.createdAt,
  };
}

function learningDialogNotificationUrl(roleSlug: string, conversationId: string) {
  const query = `?conversation=${encodeURIComponent(conversationId)}`;
  if (roleSlug === "parent") return `/family/messages${query}`;
  if (roleSlug === "teacher") return `/admin/messages${query}`;
  if (isLearningDialogCuratorRole(roleSlug)) return `/admin/communications${query}`;
  return `/messages${query}`;
}

function notificationPreview(body: string | null, attachmentCount: number) {
  const compact = body?.replace(/\s+/g, " ").trim() ?? "";
  if (compact) return compact.length > 140 ? `${compact.slice(0, 139).trimEnd()}…` : compact;
  return attachmentCount === 1 ? "Отправлен файл" : `Отправлено файлов: ${attachmentCount}`;
}

async function notifyLearningMessageRecipients(params: {
  actor: DialogActor;
  conversationId: string;
  messageId: string;
  body: string | null;
  attachmentCount: number;
}) {
  const conversation = await prisma.learningConversation.findUnique({
    where: { id: params.conversationId },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              isActive: true,
              deletedAt: true,
              role: { select: { slug: true } },
            },
          },
        },
      },
    },
  });
  if (!conversation) return;

  const sender = conversation.members.find((member) => member.userId === params.actor.userId)?.user
    ?? await prisma.user.findUnique({
      where: { id: params.actor.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        isActive: true,
        deletedAt: true,
        role: { select: { slug: true } },
      },
    });
  const senderName = sender ? personName(sender) : "Maestro";
  const recipients = new Map(conversation.members
    .filter((member) => (
      member.userId !== params.actor.userId
      && !member.notificationsMuted
      && member.user.isActive
      && !member.user.deletedAt
    ))
    .map((member) => [member.userId, member.user]));

  if (conversation.type === "curator" && !isLearningDialogCuratorRole(params.actor.roleSlug)) {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { slug: { in: ["admin", "owner", "super_admin", "curator"] } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        isActive: true,
        deletedAt: true,
        role: { select: { slug: true } },
      },
    });
    const mutedAdmins = new Set(conversation.members
      .filter((member) => member.notificationsMuted)
      .map((member) => member.userId));
    for (const admin of admins) {
      if (admin.id !== params.actor.userId && !mutedAdmins.has(admin.id)) recipients.set(admin.id, admin);
    }
  }

  const title = conversation.type === "crm_group"
    ? `Новое сообщение: ${conversation.title || "группа"}`
    : conversation.type === "curator" && isLearningDialogCuratorRole(params.actor.roleSlug)
      ? "Ответ куратора"
      : `Новое сообщение от ${senderName}`;
  const body = notificationPreview(params.body, params.attachmentCount);
  await Promise.allSettled([...recipients.values()].map((recipient) => deliverUserNotification({
    userId: recipient.id,
    type: "direct_message_received",
    title,
    body,
    url: learningDialogNotificationUrl(recipient.role.slug, params.conversationId),
    tag: `learning-dialog-${params.conversationId}`,
    dedupeKey: `learning-dialog:${params.messageId}:${recipient.id}`,
  })));
}

export async function prepareLearningMessageAttachmentUpload(
  actor: DialogActor,
  conversationId: string,
  idempotencyKey: string,
) {
  assertLearningDialogsEnabled();
  const sourceKey = apiMessageSourceKey(conversationId, actor.userId, idempotencyKey);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.learningMessage.findUnique({ where: { sourceKey } });
    if (existing) return { existing: await loadMessageResult(tx, existing.id) };
    await requireSendAccess(tx, actor, conversationId, new Date());
    return { existing: null };
  });
}

export async function sendLearningMessageWithAttachments(
  actor: DialogActor,
  conversationId: string,
  input: {
    body?: string;
    idempotencyKey: string;
    attachments: StoredLearningDialogFile[];
  } & MessageContext,
) {
  assertLearningDialogsEnabled();
  validateLearningDialogAttachments(input.attachments);
  const body = validateMessageContent(input.body, input.attachments.length);
  const now = new Date();
  const sourceKey = apiMessageSourceKey(conversationId, actor.userId, input.idempotencyKey);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.learningMessage.findUnique({ where: { sourceKey } });
    if (existing) return { created: false, message: await loadMessageResult(tx, existing.id) };
    const { member } = await requireSendAccess(tx, actor, conversationId, now);
    const message = await tx.learningMessage.create({
      data: {
        sourceKey,
        conversationId,
        authorId: actor.userId,
        contextType: input.contextType?.trim() || null,
        contextId: input.contextId?.trim() || null,
        createdAt: now,
        versions: {
          create: {
            sourceKey: `${sourceKey}:v1`,
            version: 1,
            kind: "created",
            body,
            createdById: actor.userId,
            createdAt: now,
          },
        },
        attachments: {
          create: input.attachments.map((attachment, index) => ({
            sourceKey: `api:learning-attachment:${digest([sourceKey, String(index), attachment.sha256])}`,
            conversationId,
            uploaderId: actor.userId,
            storageKey: attachment.storageKey,
            originalFilename: attachment.originalFilename,
            mimeType: attachment.mimeType,
            sizeBytes: BigInt(attachment.sizeBytes),
            sha256: attachment.sha256,
            quarantineStatus: "clean",
            createdAt: now,
          })),
        },
      },
    });
    await tx.learningConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    });
    await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: now },
    });
    return { created: true, message: await loadMessageResult(tx, message.id) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.created) {
    await notifyLearningMessageRecipients({
      actor,
      conversationId,
      messageId: result.message.id,
      body,
      attachmentCount: input.attachments.length,
    }).catch(() => undefined);
  }
  return result;
}

export async function sendLearningMessage(
  actor: DialogActor,
  conversationId: string,
  input: { body: string; idempotencyKey: string } & MessageContext,
) {
  assertLearningDialogsEnabled();
  const body = validateMessageBody(input.body);
  const now = new Date();
  const sourceKey = apiMessageSourceKey(conversationId, actor.userId, input.idempotencyKey);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.learningMessage.findUnique({ where: { sourceKey } });
    if (existing) return { created: false, message: await loadMessageResult(tx, existing.id) };
    const { member } = await requireSendAccess(tx, actor, conversationId, now);
    const message = await tx.learningMessage.create({
      data: {
        sourceKey,
        conversationId,
        authorId: actor.userId,
        contextType: input.contextType?.trim() || null,
        contextId: input.contextId?.trim() || null,
        createdAt: now,
        versions: {
          create: {
            sourceKey: `${sourceKey}:v1`,
            version: 1,
            kind: "created",
            body,
            createdById: actor.userId,
            createdAt: now,
          },
        },
      },
    });
    await tx.learningConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    });
    await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: now },
    });
    return { created: true, message: await loadMessageResult(tx, message.id) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.created) {
    await notifyLearningMessageRecipients({
      actor,
      conversationId,
      messageId: result.message.id,
      body,
      attachmentCount: 0,
    }).catch(() => undefined);
  }
  return result;
}

export async function editLearningMessage(
  actor: DialogActor,
  conversationId: string,
  messageId: string,
  input: { body: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  const body = validateMessageBody(input.body);
  const now = new Date();
  const versionSourceKey = `api:learning-message-edit:${digest([
    conversationId,
    messageId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    await requireConversationAccess(tx, actor, conversationId);
    const repeated = await tx.learningMessageVersion.findUnique({ where: { sourceKey: versionSourceKey } });
    if (repeated) return { changed: false, message: await loadMessageResult(tx, messageId) };
    const message = await tx.learningMessage.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new NotFoundError("Learning message");
    assertCanChangeLearningMessage({
      authorId: message.authorId,
      actorId: actor.userId,
      createdAt: message.createdAt,
      state: message.state,
      now,
    });
    const latest = await tx.learningMessageVersion.aggregate({
      where: { messageId },
      _max: { version: true },
    });
    await tx.learningMessageVersion.create({
      data: {
        sourceKey: versionSourceKey,
        messageId,
        version: (latest._max.version ?? 0) + 1,
        kind: "edited",
        body,
        createdById: actor.userId,
        createdAt: now,
      },
    });
    await tx.learningMessage.update({ where: { id: messageId }, data: { editedAt: now } });
    return { changed: true, message: await loadMessageResult(tx, messageId) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function retractLearningMessage(
  actor: DialogActor,
  conversationId: string,
  messageId: string,
  input: { idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  const now = new Date();
  const versionSourceKey = `api:learning-message-retract:${digest([
    conversationId,
    messageId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    await requireConversationAccess(tx, actor, conversationId);
    const repeated = await tx.learningMessageVersion.findUnique({ where: { sourceKey: versionSourceKey } });
    if (repeated) return { changed: false, message: await loadMessageResult(tx, messageId) };
    const message = await tx.learningMessage.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new NotFoundError("Learning message");
    assertCanChangeLearningMessage({
      authorId: message.authorId,
      actorId: actor.userId,
      createdAt: message.createdAt,
      state: message.state,
      now,
    });
    const latest = await tx.learningMessageVersion.aggregate({
      where: { messageId },
      _max: { version: true },
    });
    await tx.learningMessageVersion.create({
      data: {
        sourceKey: versionSourceKey,
        messageId,
        version: (latest._max.version ?? 0) + 1,
        kind: "retracted",
        body: null,
        createdById: actor.userId,
        createdAt: now,
      },
    });
    await tx.learningMessage.update({
      where: { id: messageId },
      data: { state: "retracted", retractedAt: now },
    });
    return { changed: true, message: await loadMessageResult(tx, messageId) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getLearningDialogAttachmentDownload(
  actor: DialogActor,
  attachmentId: string,
) {
  assertLearningDialogsEnabled();
  const attachment = await prisma.$transaction(async (tx) => {
    const row = await tx.learningMessageAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { state: true } } },
    });
    if (!row || row.deletedAt || row.quarantineStatus !== "clean") {
      throw new NotFoundError("Learning dialog attachment");
    }
    await requireConversationAccess(tx, actor, row.conversationId);
    if (row.message.state !== "visible" && !isLearningDialogCuratorRole(actor.roleSlug)) {
      throw new NotFoundError("Learning dialog attachment");
    }
    return row;
  });
  const stored = await getLearningDialogFile(attachment.storageKey);
  await prisma.auditLog.create({
    data: {
      entityType: "learning_message_attachment",
      entityId: attachment.id,
      action: "read",
      actorId: actor.userId,
      payload: inputJson({
        conversationId: attachment.conversationId,
        messageId: attachment.messageId,
        sizeBytes: attachment.sizeBytes.toString(),
      }),
    },
  });
  return {
    stream: stored.stream,
    sizeBytes: stored.sizeBytes,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename,
  };
}

export async function reportLearningMessage(
  actor: DialogActor,
  conversationId: string,
  messageId: string,
  input: { versionId: string; reason: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  if (isLearningDialogCuratorRole(actor.roleSlug)) {
    throw new ForbiddenError("Жалобу отправляет участник диалога");
  }
  const reason = moderationReason(input.reason);
  const reportKey = `api:learning-message-report:${digest([
    conversationId,
    messageId,
    input.versionId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    await requireConversationAccess(tx, actor, conversationId);
    const existing = await tx.learningMessageReport.findUnique({ where: { reportKey } });
    if (existing) return { created: false, report: existing };
    const version = await tx.learningMessageVersion.findFirst({
      where: { id: input.versionId, messageId, message: { conversationId } },
      select: { id: true },
    });
    if (!version) throw new NotFoundError("Learning message version");
    const report = await tx.learningMessageReport.create({
      data: {
        reportKey,
        messageId,
        versionId: version.id,
        reporterId: actor.userId,
        reason,
      },
    });
    await upsertAdminJournalEntry({
      sourceKey: `learning-dialog-report:${report.id}`,
      type: "complaint",
      severity: "normal",
      source: "moderation",
      linkedEntityType: "learning_message_report",
      linkedEntityId: report.id,
      title: "Жалоба на сообщение",
      summary: reason,
      actorId: actor.userId,
      payload: {
        conversationId,
        messageId,
        versionId: version.id,
      },
    }, tx);
    return { created: true, report };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function writeResolvedModerationJournal(
  tx: Prisma.TransactionClient,
  params: {
    actionId: string;
    actorId: string;
    title: string;
    summary: string;
    conversationId: string;
    messageId?: string | null;
    targetUserId?: string | null;
  },
) {
  await upsertAdminJournalEntry({
    sourceKey: `learning-dialog-moderation:${params.actionId}`,
    type: "moderation",
    severity: "normal",
    source: "moderation",
    linkedEntityType: "learning_conversation_moderation_action",
    linkedEntityId: params.actionId,
    title: params.title,
    summary: params.summary,
    actorId: params.actorId,
    initialStatus: "resolved",
    resolution: params.summary,
    payload: {
      conversationId: params.conversationId,
      messageId: params.messageId ?? null,
      targetUserId: params.targetUserId ?? null,
    },
  }, tx);
}

export async function hideLearningMessage(
  actor: DialogActor,
  conversationId: string,
  messageId: string,
  input: { reason: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  assertModerator(actor);
  const reason = moderationReason(input.reason);
  const actionKey = `api:learning-message-hide:${digest([
    conversationId,
    messageId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    await requireConversationAccess(tx, actor, conversationId);
    const repeated = await tx.learningConversationModerationAction.findUnique({ where: { actionKey } });
    if (repeated) return { changed: false, message: await loadMessageResult(tx, messageId), action: repeated };
    const message = await tx.learningMessage.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new NotFoundError("Learning message");
    if (message.state !== "visible") throw new BadRequestError("Сообщение уже скрыто или отозвано");
    const action = await tx.learningConversationModerationAction.create({
      data: {
        actionKey,
        conversationId,
        messageId,
        actorId: actor.userId,
        action: "message_hidden",
        reason,
      },
    });
    await tx.learningMessage.update({
      where: { id: messageId },
      data: {
        state: "hidden",
        hiddenAt: new Date(),
        hiddenById: actor.userId,
        hiddenReason: reason,
      },
    });
    await writeResolvedModerationJournal(tx, {
      actionId: action.id,
      actorId: actor.userId,
      title: "Сообщение скрыто",
      summary: reason,
      conversationId,
      messageId,
    });
    return { changed: true, message: await loadMessageResult(tx, messageId), action };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveLearningMessageReport(
  actor: DialogActor,
  conversationId: string,
  reportId: string,
  input: {
    status: "resolved" | "dismissed";
    resolution: string;
    idempotencyKey: string;
  },
) {
  assertLearningDialogsEnabled();
  assertModerator(actor);
  const resolution = moderationReason(input.resolution, "Укажите решение по жалобе");
  const actionKey = `api:learning-report-resolution:${digest([
    conversationId,
    reportId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    await requireConversationAccess(tx, actor, conversationId);
    const repeated = await tx.learningConversationModerationAction.findUnique({ where: { actionKey } });
    if (repeated) {
      return { changed: false, report: await tx.learningMessageReport.findUniqueOrThrow({ where: { id: reportId } }) };
    }
    const report = await tx.learningMessageReport.findFirst({
      where: { id: reportId, message: { conversationId } },
    });
    if (!report) throw new NotFoundError("Learning message report");
    if (report.status !== "open") throw new BadRequestError("Жалоба уже рассмотрена");
    const now = new Date();
    const updated = await tx.learningMessageReport.update({
      where: { id: report.id },
      data: {
        status: input.status,
        resolution,
        resolvedById: actor.userId,
        resolvedAt: now,
      },
    });
    await tx.learningConversationModerationAction.create({
      data: {
        actionKey,
        conversationId,
        messageId: report.messageId,
        actorId: actor.userId,
        action: input.status === "resolved" ? "report_resolved" : "report_dismissed",
        reason: resolution,
        payload: inputJson({ reportId }),
      },
    });
    const journalSourceKey = `learning-dialog-report:${report.id}`;
    const journal = await upsertAdminJournalEntry({
      sourceKey: journalSourceKey,
      type: "complaint",
      severity: "normal",
      source: "moderation",
      linkedEntityType: "learning_message_report",
      linkedEntityId: report.id,
      title: "Жалоба на сообщение",
      summary: report.reason,
      actorId: report.reporterId,
    }, tx);
    await tx.adminJournalEntry.update({
      where: { id: journal.id },
      data: { status: input.status, resolution },
    });
    await tx.adminJournalAction.upsert({
      where: { actionKey: `${actionKey}:journal` },
      create: {
        actionKey: `${actionKey}:journal`,
        entryId: journal.id,
        action: "status_changed",
        fromStatus: journal.status,
        toStatus: input.status,
        note: resolution,
        actorId: actor.userId,
        payload: inputJson({ reportId }),
      },
      update: {},
    });
    return { changed: true, report: updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function restrictLearningDialogGroupMember(
  actor: DialogActor,
  conversationId: string,
  targetUserId: string,
  input: { restrictedUntil: Date; reason: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  assertModerator(actor);
  const reason = moderationReason(input.reason);
  const actionKey = `api:learning-member-restrict:${digest([
    conversationId,
    targetUserId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    const { conversation } = await requireConversationAccess(tx, actor, conversationId);
    if (conversation.type !== "crm_group") {
      throw new BadRequestError("Ограничение отправки доступно только в CRM-группе");
    }
    const repeated = await tx.learningConversationModerationAction.findUnique({ where: { actionKey } });
    if (repeated) {
      return {
        changed: false,
        member: await tx.learningConversationMember.findUniqueOrThrow({
          where: { conversationId_userId: { conversationId, userId: targetUserId } },
        }),
        action: repeated,
      };
    }
    if (input.restrictedUntil.getTime() <= Date.now()) {
      throw new BadRequestError("Срок ограничения должен быть в будущем");
    }
    const member = await tx.learningConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    if (!member || member.leftAt) throw new NotFoundError("Active learning conversation member");
    const updated = await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { restrictedUntil: input.restrictedUntil, restrictionReason: reason },
    });
    const action = await tx.learningConversationModerationAction.create({
      data: {
        actionKey,
        conversationId,
        targetUserId,
        actorId: actor.userId,
        action: "member_restricted",
        reason,
        restrictionUntil: input.restrictedUntil,
      },
    });
    await tx.learningConversationMembershipEvent.create({
      data: {
        sourceKey: `${actionKey}:membership-event`,
        conversationId,
        memberId: member.id,
        userId: targetUserId,
        event: "write_disabled",
        source: "moderation",
        payload: inputJson({ reason, restrictedUntil: input.restrictedUntil.toISOString() }),
        occurredAt: new Date(),
      },
    });
    await writeResolvedModerationJournal(tx, {
      actionId: action.id,
      actorId: actor.userId,
      title: "Отправка в группе временно ограничена",
      summary: reason,
      conversationId,
      targetUserId,
    });
    return { changed: true, member: updated, action };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function unrestrictLearningDialogGroupMember(
  actor: DialogActor,
  conversationId: string,
  targetUserId: string,
  input: { reason: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  assertModerator(actor);
  const reason = moderationReason(input.reason);
  const actionKey = `api:learning-member-unrestrict:${digest([
    conversationId,
    targetUserId,
    actor.userId,
    input.idempotencyKey,
  ])}`;
  return prisma.$transaction(async (tx) => {
    const { conversation } = await requireConversationAccess(tx, actor, conversationId);
    if (conversation.type !== "crm_group") {
      throw new BadRequestError("Ограничение отправки доступно только в CRM-группе");
    }
    const repeated = await tx.learningConversationModerationAction.findUnique({ where: { actionKey } });
    if (repeated) {
      return {
        changed: false,
        member: await tx.learningConversationMember.findUniqueOrThrow({
          where: { conversationId_userId: { conversationId, userId: targetUserId } },
        }),
        action: repeated,
      };
    }
    const member = await tx.learningConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    if (!member || member.leftAt) throw new NotFoundError("Active learning conversation member");
    if (!member.restrictedUntil) throw new BadRequestError("Отправка сообщений уже разрешена");
    const updated = await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { restrictedUntil: null, restrictionReason: null },
    });
    const action = await tx.learningConversationModerationAction.create({
      data: {
        actionKey,
        conversationId,
        targetUserId,
        actorId: actor.userId,
        action: "member_unrestricted",
        reason,
      },
    });
    await tx.learningConversationMembershipEvent.create({
      data: {
        sourceKey: `${actionKey}:membership-event`,
        conversationId,
        memberId: member.id,
        userId: targetUserId,
        event: "write_enabled",
        source: "moderation",
        payload: inputJson({ reason }),
        occurredAt: new Date(),
      },
    });
    await writeResolvedModerationJournal(tx, {
      actionId: action.id,
      actorId: actor.userId,
      title: "Ограничение отправки снято",
      summary: reason,
      conversationId,
      targetUserId,
    });
    return { changed: true, member: updated, action };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function ensureStudentCuratorConversation(studentId: string) {
  assertLearningDialogsEnabled();
  const now = new Date();
  const sourceKey = `curator:student:${studentId}`;
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.learningConversation.upsert({
      where: { sourceKey },
      create: {
        sourceKey,
        scopeKey: sourceKey,
        type: "curator",
        title: "Куратор",
      },
      update: {},
    });
    const existing = await tx.learningConversationMember.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: studentId } },
    });
    if (!existing) {
      const member = await tx.learningConversationMember.create({
        data: {
          conversationId: conversation.id,
          userId: studentId,
          role: "student",
          joinedAt: now,
        },
      });
      await tx.learningConversationMembershipEvent.upsert({
        where: { sourceKey: `dialog-api:curator-student:${conversation.id}:${studentId}` },
        create: {
          sourceKey: `dialog-api:curator-student:${conversation.id}:${studentId}`,
          conversationId: conversation.id,
          memberId: member.id,
          userId: studentId,
          event: "joined",
          source: "dialog_api",
          occurredAt: now,
        },
        update: {},
      });
    }
    return conversation;
  });
}

export async function startStudentCuratorConversation(
  actor: DialogActor,
  input: { body: string; idempotencyKey: string } & MessageContext,
) {
  assertLearningDialogsEnabled();
  if (actor.roleSlug !== "student") {
    throw new ForbiddenError("Обращение куратору может начать ученик");
  }
  const conversation = await ensureStudentCuratorConversation(actor.userId);
  const result = await sendLearningMessage(actor, conversation.id, input);
  return { conversationId: conversation.id, ...result };
}

export async function sendLearningLessonQuestion(
  actor: DialogActor,
  input: { lessonId: string; body: string; idempotencyKey: string },
) {
  assertLearningDialogsEnabled();
  if (actor.roleSlug !== "student") {
    throw new ForbiddenError("Вопрос по уроку может отправить ученик");
  }
  const lesson = await prisma.lesson.findFirst({
    where: { id: input.lessonId, deletedAt: null },
    select: {
      id: true,
      module: {
        select: {
          course: {
            select: {
              direction: { select: { id: true, crmDirectionId: true } },
            },
          },
        },
      },
    },
  });
  if (!lesson) throw new NotFoundError("Lesson");
  const direction = lesson.module.course.direction;
  const conversation = await prisma.learningConversation.findFirst({
    where: {
      type: "learning_direction",
      status: "active",
      crmDirectionId: { in: [direction.crmDirectionId, direction.id].filter((value): value is string => Boolean(value)) },
      members: { some: { userId: actor.userId, leftAt: null, canWrite: true } },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conversation) {
    throw new BadRequestError("Для направления урока пока нет активного диалога с преподавателем");
  }
  const result = await sendLearningMessage(actor, conversation.id, {
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    contextType: "lesson",
    contextId: lesson.id,
  });
  return { conversationId: conversation.id, ...result };
}
