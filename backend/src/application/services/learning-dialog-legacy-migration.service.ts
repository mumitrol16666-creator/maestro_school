import { Prisma } from "@prisma/client";
import { productFeatureConfig } from "../../config/product-features.js";
import { ConflictError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export type LearningDialogLegacyMigrationOverrides = Record<string, string>;

type ConversationMapping = {
  legacyConversationId: string;
  targetConversationId: string;
  studentId: string;
  teacherId: string;
  pendingMessageCount: number;
  source: "automatic" | "override";
};

type UnmappedConversation = {
  legacyConversationId: string;
  studentId: string;
  teacherId: string;
  pendingMessageCount: number;
  reason: "no_target" | "ambiguous_target" | "invalid_override";
  candidateConversationIds: string[];
};

export type LearningDialogLegacyMigrationPreview = {
  legacy: {
    conversations: number;
    directMessages: number;
    lessonQuestions: number;
  };
  alreadyMigrated: {
    directMessages: number;
    lessonQuestions: number;
  };
  pending: {
    directMessages: number;
    lessonQuestions: number;
  };
  skippedEmptyConversations: number;
  mappings: ConversationMapping[];
  unmappedConversations: UnmappedConversation[];
  blockers: string[];
};

function directMessageSourceKey(id: string) {
  return `legacy:teacher-message:${id}`;
}

function lessonQuestionSourceKey(id: string) {
  return `legacy:lesson-question:${id}`;
}

async function candidateTargets(studentId: string, teacherId: string) {
  return prisma.learningConversation.findMany({
    where: {
      type: "learning_direction",
      AND: [
        { members: { some: { userId: studentId, role: "student" } } },
        { members: { some: { userId: teacherId, role: "teacher" } } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });
}

export async function previewLearningDialogLegacyMigration(
  overrides: LearningDialogLegacyMigrationOverrides = {},
): Promise<LearningDialogLegacyMigrationPreview> {
  const [legacyConversations, lessonQuestions, migratedMessages] = await Promise.all([
    prisma.teacherConversation.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        messages: { select: { id: true } },
      },
    }),
    prisma.lessonQuestion.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
    }),
    prisma.learningMessage.findMany({
      where: {
        OR: [
          { sourceKey: { startsWith: "legacy:teacher-message:" } },
          { sourceKey: { startsWith: "legacy:lesson-question:" } },
        ],
      },
      select: { sourceKey: true },
    }),
  ]);
  const migrated = new Set(migratedMessages.map((message) => message.sourceKey));
  const mappings: ConversationMapping[] = [];
  const unmappedConversations: UnmappedConversation[] = [];
  let directMessages = 0;
  let pendingDirectMessages = 0;
  let alreadyMigratedDirectMessages = 0;
  let skippedEmptyConversations = 0;

  for (const conversation of legacyConversations) {
    directMessages += conversation.messages.length;
    const pendingMessageCount = conversation.messages.filter((message) => {
      const exists = migrated.has(directMessageSourceKey(message.id));
      if (exists) alreadyMigratedDirectMessages += 1;
      return !exists;
    }).length;
    pendingDirectMessages += pendingMessageCount;
    if (pendingMessageCount === 0) {
      if (conversation.messages.length === 0) skippedEmptyConversations += 1;
      continue;
    }

    const candidates = await candidateTargets(conversation.studentId, conversation.teacherId);
    const overrideId = overrides[conversation.id];
    if (overrideId) {
      if (!candidates.some((candidate) => candidate.id === overrideId)) {
        unmappedConversations.push({
          legacyConversationId: conversation.id,
          studentId: conversation.studentId,
          teacherId: conversation.teacherId,
          pendingMessageCount,
          reason: "invalid_override",
          candidateConversationIds: candidates.map((candidate) => candidate.id),
        });
        continue;
      }
      mappings.push({
        legacyConversationId: conversation.id,
        targetConversationId: overrideId,
        studentId: conversation.studentId,
        teacherId: conversation.teacherId,
        pendingMessageCount,
        source: "override",
      });
      continue;
    }
    if (candidates.length !== 1) {
      unmappedConversations.push({
        legacyConversationId: conversation.id,
        studentId: conversation.studentId,
        teacherId: conversation.teacherId,
        pendingMessageCount,
        reason: candidates.length === 0 ? "no_target" : "ambiguous_target",
        candidateConversationIds: candidates.map((candidate) => candidate.id),
      });
      continue;
    }
    mappings.push({
      legacyConversationId: conversation.id,
      targetConversationId: candidates[0].id,
      studentId: conversation.studentId,
      teacherId: conversation.teacherId,
      pendingMessageCount,
      source: "automatic",
    });
  }

  const pendingQuestions = lessonQuestions.filter((question) => (
    !migrated.has(lessonQuestionSourceKey(question.id))
  ));
  const blockers = unmappedConversations.map((item) => (
    `${item.legacyConversationId}:${item.reason}:${item.pendingMessageCount}`
  ));
  return {
    legacy: {
      conversations: legacyConversations.length,
      directMessages,
      lessonQuestions: lessonQuestions.length,
    },
    alreadyMigrated: {
      directMessages: alreadyMigratedDirectMessages,
      lessonQuestions: lessonQuestions.length - pendingQuestions.length,
    },
    pending: {
      directMessages: pendingDirectMessages,
      lessonQuestions: pendingQuestions.length,
    },
    skippedEmptyConversations,
    mappings,
    unmappedConversations,
    blockers,
  };
}

async function updateLastMessageAt(
  tx: Prisma.TransactionClient,
  conversationId: string,
  candidate: Date,
) {
  const conversation = await tx.learningConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { lastMessageAt: true },
  });
  if (!conversation.lastMessageAt || conversation.lastMessageAt < candidate) {
    await tx.learningConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: candidate },
    });
  }
}

async function updateReadCursor(
  tx: Prisma.TransactionClient,
  conversationId: string,
  userId: string,
  readAt: Date,
) {
  const member = await tx.learningConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, lastReadAt: true },
  });
  if (member && (!member.lastReadAt || member.lastReadAt < readAt)) {
    await tx.learningConversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: readAt },
    });
  }
}

async function ensureLegacyCuratorConversation(
  tx: Prisma.TransactionClient,
  studentId: string,
  occurredAt: Date,
) {
  const sourceKey = `curator:student:${studentId}`;
  const conversation = await tx.learningConversation.upsert({
    where: { sourceKey },
    create: {
      sourceKey,
      scopeKey: sourceKey,
      type: "curator",
      title: "Куратор",
      createdAt: occurredAt,
    },
    update: {},
  });
  let member = await tx.learningConversationMember.findUnique({
    where: { conversationId_userId: { conversationId: conversation.id, userId: studentId } },
  });
  if (!member) {
    member = await tx.learningConversationMember.create({
      data: {
        conversationId: conversation.id,
        userId: studentId,
        role: "student",
        joinedAt: occurredAt,
        lastReadAt: occurredAt,
      },
    });
    await tx.learningConversationMembershipEvent.upsert({
      where: { sourceKey: `legacy:curator-student-member:${conversation.id}:${studentId}` },
      create: {
        sourceKey: `legacy:curator-student-member:${conversation.id}:${studentId}`,
        conversationId: conversation.id,
        memberId: member.id,
        userId: studentId,
        event: "joined",
        source: "legacy_migration",
        occurredAt,
      },
      update: {},
    });
  }
  return conversation;
}

export async function applyLearningDialogLegacyMigration(
  overrides: LearningDialogLegacyMigrationOverrides = {},
) {
  if (!productFeatureConfig.flags.learningDialogsV2) {
    throw new ConflictError("Новый контур диалогов выключен", "LEARNING_DIALOGS_V2_DISABLED");
  }
  const preview = await previewLearningDialogLegacyMigration(overrides);
  if (preview.blockers.length > 0) {
    throw new ConflictError(
      `Legacy migration заблокирована: ${preview.blockers.join("; ")}`,
      "LEARNING_DIALOG_LEGACY_UNMAPPED",
    );
  }

  return prisma.$transaction(async (tx) => {
    let createdDirectMessages = 0;
    let existingDirectMessages = 0;
    let createdLessonQuestions = 0;
    let existingLessonQuestions = 0;

    for (const mapping of preview.mappings) {
      const legacy = await tx.teacherConversation.findUniqueOrThrow({
        where: { id: mapping.legacyConversationId },
        include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      for (const message of legacy.messages) {
        const sourceKey = directMessageSourceKey(message.id);
        const existing = await tx.learningMessage.findUnique({ where: { sourceKey } });
        if (existing) {
          existingDirectMessages += 1;
          continue;
        }
        await tx.learningMessage.create({
          data: {
            sourceKey,
            conversationId: mapping.targetConversationId,
            authorId: message.senderId,
            createdAt: message.createdAt,
            versions: {
              create: {
                sourceKey: `${sourceKey}:v1`,
                version: 1,
                kind: "created",
                body: message.body,
                createdById: message.senderId,
                createdAt: message.createdAt,
              },
            },
          },
        });
        createdDirectMessages += 1;
        await updateLastMessageAt(tx, mapping.targetConversationId, message.createdAt);
        await updateReadCursor(tx, mapping.targetConversationId, message.senderId, message.createdAt);
        if (message.readAt) {
          const recipientId = message.senderId === legacy.studentId
            ? legacy.teacherId
            : legacy.studentId;
          await updateReadCursor(tx, mapping.targetConversationId, recipientId, message.readAt);
        }
      }
    }

    const questions = await tx.lessonQuestion.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const question of questions) {
      const sourceKey = lessonQuestionSourceKey(question.id);
      const existing = await tx.learningMessage.findUnique({ where: { sourceKey } });
      if (existing) {
        existingLessonQuestions += 1;
        continue;
      }
      const conversation = await ensureLegacyCuratorConversation(tx, question.studentId, question.createdAt);
      await tx.learningMessage.create({
        data: {
          sourceKey,
          conversationId: conversation.id,
          authorId: question.studentId,
          contextType: "lesson",
          contextId: question.lessonId,
          createdAt: question.createdAt,
          versions: {
            create: {
              sourceKey: `${sourceKey}:v1`,
              version: 1,
              kind: "created",
              body: question.message,
              createdById: question.studentId,
              createdAt: question.createdAt,
            },
          },
        },
      });
      createdLessonQuestions += 1;
      await updateLastMessageAt(tx, conversation.id, question.createdAt);
      await updateReadCursor(tx, conversation.id, question.studentId, question.createdAt);
    }

    return {
      preview,
      created: {
        directMessages: createdDirectMessages,
        lessonQuestions: createdLessonQuestions,
      },
      existing: {
        directMessages: existingDirectMessages,
        lessonQuestions: existingLessonQuestions,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
