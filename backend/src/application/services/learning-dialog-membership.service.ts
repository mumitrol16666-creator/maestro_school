import { createHash } from "node:crypto";
import { Prisma, type LearningConversationMemberRole } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { getLearningConversationRetention } from "../../domain/learning-dialog-policy.js";
import {
  fetchCrmDirections,
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { productFeatureConfig } from "../../config/product-features.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

type ProjectionTransaction = Prisma.TransactionClient;

export type LearningDirectionAssignmentProjection = {
  studentUserId: string;
  teacherUserId: string;
  crmDirectionId: string;
  directionTitle: string;
  parentUserIds: string[];
};

export type LearningGroupProjection = {
  crmGroupId: string;
  title: string;
  crmDirectionId: string | null;
  teacherUserId: string;
  studentUserIds: string[];
};

export type LearningDialogMembershipProjection = {
  namespace: string;
  teacherUserId: string;
  syncedAt: Date;
  assignments: LearningDirectionAssignmentProjection[];
  groups: LearningGroupProjection[];
};

function digest(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function learningScopeKey(namespace: string, assignment: LearningDirectionAssignmentProjection) {
  return `${namespace}:learning:${digest([
    assignment.studentUserId,
    assignment.teacherUserId,
    assignment.crmDirectionId,
  ]).slice(0, 40)}`;
}

function parentScopeKey(namespace: string, assignment: LearningDirectionAssignmentProjection) {
  return `${namespace}:parent:${digest([
    assignment.studentUserId,
    assignment.teacherUserId,
    assignment.crmDirectionId,
  ]).slice(0, 40)}`;
}

function groupScopeKey(namespace: string, crmGroupId: string) {
  return `${namespace}:group:${digest([crmGroupId]).slice(0, 40)}`;
}

function membershipEventKey(params: {
  conversationId: string;
  userId: string;
  event: string;
  occurredAt: Date;
}) {
  return `dialog-member:${digest([
    params.conversationId,
    params.userId,
    params.event,
    params.occurredAt.toISOString(),
  ])}`;
}

async function appendMembershipEvent(
  tx: ProjectionTransaction,
  params: {
    conversationId: string;
    memberId: string | null;
    userId: string;
    event: "joined" | "left" | "write_enabled" | "write_disabled";
    source: string;
    occurredAt: Date;
    payload?: Prisma.InputJsonValue;
  },
) {
  await tx.learningConversationMembershipEvent.upsert({
    where: {
      sourceKey: membershipEventKey(params),
    },
    create: {
      sourceKey: membershipEventKey(params),
      conversationId: params.conversationId,
      memberId: params.memberId,
      userId: params.userId,
      event: params.event,
      source: params.source,
      occurredAt: params.occurredAt,
      payload: params.payload,
    },
    update: {},
  });
}

async function activateMember(
  tx: ProjectionTransaction,
  params: {
    conversationId: string;
    userId: string;
    role: LearningConversationMemberRole;
    source: string;
    syncedAt: Date;
  },
) {
  const existing = await tx.learningConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: params.conversationId,
        userId: params.userId,
      },
    },
  });
  const changed = !existing || existing.leftAt !== null || !existing.canWrite || existing.role !== params.role;
  const member = existing
    ? await tx.learningConversationMember.update({
        where: { id: existing.id },
        data: {
          role: params.role,
          canWrite: true,
          leftAt: null,
          ...(existing.leftAt ? { joinedAt: params.syncedAt } : {}),
        },
      })
    : await tx.learningConversationMember.create({
        data: {
          conversationId: params.conversationId,
          userId: params.userId,
          role: params.role,
          joinedAt: params.syncedAt,
        },
      });
  if (changed) {
    await appendMembershipEvent(tx, {
      conversationId: params.conversationId,
      memberId: member.id,
      userId: params.userId,
      event: existing?.leftAt ? "joined" : existing ? "write_enabled" : "joined",
      source: params.source,
      occurredAt: params.syncedAt,
    });
  }
  return member;
}

async function leaveMember(
  tx: ProjectionTransaction,
  params: {
    member: { id: string; conversationId: string; userId: string; leftAt: Date | null };
    source: string;
    syncedAt: Date;
  },
) {
  if (params.member.leftAt) return;
  await tx.learningConversationMember.update({
    where: { id: params.member.id },
    data: { canWrite: false, leftAt: params.syncedAt },
  });
  await appendMembershipEvent(tx, {
    conversationId: params.member.conversationId,
    memberId: params.member.id,
    userId: params.member.userId,
    event: "left",
    source: params.source,
    occurredAt: params.syncedAt,
  });
}

async function archiveLearningConversation(
  tx: ProjectionTransaction,
  conversation: {
    id: string;
    members: Array<{ id: string; userId: string; canWrite: boolean }>;
  },
  source: string,
  syncedAt: Date,
) {
  const retention = getLearningConversationRetention(syncedAt);
  await tx.learningConversation.update({
    where: { id: conversation.id },
    data: {
      status: "read_only",
      closedAt: syncedAt,
      ...retention,
      members: { updateMany: { where: { canWrite: true }, data: { canWrite: false } } },
    },
  });
  for (const member of conversation.members.filter((item) => item.canWrite)) {
    await appendMembershipEvent(tx, {
      conversationId: conversation.id,
      memberId: member.id,
      userId: member.userId,
      event: "write_disabled",
      source,
      occurredAt: syncedAt,
    });
  }
}

async function ensureLearningConversation(
  tx: ProjectionTransaction,
  assignment: LearningDirectionAssignmentProjection,
  namespace: string,
  syncedAt: Date,
) {
  const scopeKey = learningScopeKey(namespace, assignment);
  let conversation = await tx.learningConversation.findFirst({
    where: { scopeKey },
    orderBy: { createdAt: "desc" },
  });
  if (!conversation) {
    const cycle = await tx.learningConversation.count({ where: { scopeKey } }) + 1;
    conversation = await tx.learningConversation.create({
      data: {
        sourceKey: `${scopeKey}:cycle:${cycle}`,
        scopeKey,
        type: "learning_direction",
        title: assignment.directionTitle,
        crmDirectionId: assignment.crmDirectionId,
        context: { cycle },
      },
    });
  } else if (conversation.status !== "active") {
    conversation = await tx.learningConversation.update({
      where: { id: conversation.id },
      data: {
        status: "active",
        closedAt: null,
        textRetentionUntil: null,
        attachmentRetentionUntil: null,
      },
    });
  }
  await activateMember(tx, {
    conversationId: conversation.id,
    userId: assignment.studentUserId,
    role: "student",
    source: "crm_assignment",
    syncedAt,
  });
  await activateMember(tx, {
    conversationId: conversation.id,
    userId: assignment.teacherUserId,
    role: "teacher",
    source: "crm_assignment",
    syncedAt,
  });
  return conversation;
}

async function ensureParentConversation(
  tx: ProjectionTransaction,
  assignment: LearningDirectionAssignmentProjection,
  namespace: string,
  syncedAt: Date,
) {
  const scopeKey = parentScopeKey(namespace, assignment);
  let conversation = await tx.learningConversation.findFirst({
    where: { scopeKey },
    orderBy: { createdAt: "desc" },
  });
  if (!conversation) {
    conversation = await tx.learningConversation.create({
      data: {
        sourceKey: scopeKey,
        scopeKey,
        type: "parent_teacher",
        title: assignment.directionTitle,
        crmDirectionId: assignment.crmDirectionId,
        context: { studentUserId: assignment.studentUserId },
      },
    });
  } else if (conversation.status !== "active") {
    conversation = await tx.learningConversation.update({
      where: { id: conversation.id },
      data: {
        status: "active",
        closedAt: null,
        textRetentionUntil: null,
        attachmentRetentionUntil: null,
      },
    });
  }

  const desired = new Map<string, LearningConversationMemberRole>([
    [assignment.teacherUserId, "teacher"],
    ...assignment.parentUserIds.map((userId) => [userId, "parent"] as const),
  ]);
  for (const [userId, role] of desired) {
    await activateMember(tx, {
      conversationId: conversation.id,
      userId,
      role,
      source: "parent_teacher_assignment",
      syncedAt,
    });
  }
  const current = await tx.learningConversationMember.findMany({
    where: { conversationId: conversation.id, leftAt: null },
  });
  for (const member of current) {
    if (!desired.has(member.userId) && member.role !== "curator") {
      await leaveMember(tx, {
        member,
        source: "parent_teacher_assignment",
        syncedAt,
      });
    }
  }
  return conversation;
}

async function syncGroupConversation(
  tx: ProjectionTransaction,
  group: LearningGroupProjection,
  namespace: string,
  syncedAt: Date,
) {
  const scopeKey = groupScopeKey(namespace, group.crmGroupId);
  const conversation = await tx.learningConversation.upsert({
    where: { sourceKey: scopeKey },
    create: {
      sourceKey: scopeKey,
      scopeKey,
      type: "crm_group",
      title: group.title,
      crmDirectionId: group.crmDirectionId,
      crmGroupId: group.crmGroupId,
    },
    update: {
      status: "active",
      title: group.title,
      crmDirectionId: group.crmDirectionId,
      closedAt: null,
      textRetentionUntil: null,
      attachmentRetentionUntil: null,
    },
  });
  const desired = new Map<string, LearningConversationMemberRole>([
    [group.teacherUserId, "teacher"],
    ...group.studentUserIds.map((userId) => [userId, "student"] as const),
  ]);
  for (const [userId, role] of desired) {
    await activateMember(tx, {
      conversationId: conversation.id,
      userId,
      role,
      source: "crm_group",
      syncedAt,
    });
  }
  const current = await tx.learningConversationMember.findMany({
    where: { conversationId: conversation.id, leftAt: null },
  });
  for (const member of current) {
    if (!desired.has(member.userId) && member.role !== "curator") {
      await leaveMember(tx, { member, source: "crm_group", syncedAt });
    }
  }
  return conversation;
}

export async function applyLearningDialogMembershipProjection(
  input: LearningDialogMembershipProjection,
) {
  const sourcePrefix = `${input.namespace}:`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const desiredLearningScopes = new Set<string>();
        const desiredParentScopes = new Set<string>();
        for (const assignment of input.assignments) {
          if (assignment.teacherUserId !== input.teacherUserId) {
            throw new ConflictError(
              "CRM projection содержит чужого преподавателя",
              "DIALOG_PROJECTION_SCOPE_INVALID",
            );
          }
          desiredLearningScopes.add(learningScopeKey(input.namespace, assignment));
          await ensureLearningConversation(tx, assignment, input.namespace, input.syncedAt);
          if (assignment.parentUserIds.length > 0) {
            desiredParentScopes.add(parentScopeKey(input.namespace, assignment));
            await ensureParentConversation(tx, assignment, input.namespace, input.syncedAt);
          }
        }

        const activeParentDialogs = await tx.learningConversation.findMany({
          where: {
            type: "parent_teacher",
            status: "active",
            sourceKey: { startsWith: `${sourcePrefix}parent:` },
            members: { some: { userId: input.teacherUserId, role: "teacher", leftAt: null } },
          },
          include: { members: { select: { id: true, userId: true, canWrite: true } } },
        });
        for (const conversation of activeParentDialogs) {
          if (!conversation.scopeKey || !desiredParentScopes.has(conversation.scopeKey)) {
            await archiveLearningConversation(
              tx,
              conversation,
              "parent_teacher_assignment",
              input.syncedAt,
            );
          }
        }

        const activeLearning = await tx.learningConversation.findMany({
          where: {
            type: "learning_direction",
            status: "active",
            sourceKey: { startsWith: `${sourcePrefix}learning:` },
            members: { some: { userId: input.teacherUserId, role: "teacher", leftAt: null } },
          },
          include: { members: { select: { id: true, userId: true, canWrite: true } } },
        });
        for (const conversation of activeLearning) {
          if (!conversation.scopeKey || !desiredLearningScopes.has(conversation.scopeKey)) {
            await archiveLearningConversation(tx, conversation, "crm_assignment", input.syncedAt);
          }
        }

        const desiredGroupScopes = new Set<string>();
        for (const group of input.groups) {
          if (group.teacherUserId !== input.teacherUserId) {
            throw new ConflictError(
              "CRM projection группы содержит чужого преподавателя",
              "DIALOG_PROJECTION_SCOPE_INVALID",
            );
          }
          desiredGroupScopes.add(groupScopeKey(input.namespace, group.crmGroupId));
          await syncGroupConversation(tx, group, input.namespace, input.syncedAt);
        }

        const missingGroups = await tx.learningConversation.findMany({
          where: {
            type: "crm_group",
            status: "active",
            sourceKey: { startsWith: `${sourcePrefix}group:` },
            members: { some: { userId: input.teacherUserId, role: "teacher", leftAt: null } },
          },
          include: { members: true },
        });
        for (const conversation of missingGroups) {
          if (conversation.scopeKey && desiredGroupScopes.has(conversation.scopeKey)) continue;
          const teacherMember = conversation.members.find((member) => (
            member.userId === input.teacherUserId && member.role === "teacher" && !member.leftAt
          ));
          if (teacherMember) {
            await leaveMember(tx, {
              member: teacherMember,
              source: "crm_group",
              syncedAt: input.syncedAt,
            });
          }
          const otherActiveTeacher = conversation.members.some((member) => (
            member.role === "teacher" && member.userId !== input.teacherUserId && !member.leftAt
          ));
          if (!otherActiveTeacher) {
            await archiveLearningConversation(tx, {
              id: conversation.id,
              members: conversation.members.map((member) => (
                member.id === teacherMember?.id ? { ...member, canWrite: false } : member
              )),
            }, "crm_group", input.syncedAt);
          }
        }

        return {
          learningScopes: desiredLearningScopes.size,
          parentScopes: desiredParentScopes.size,
          groupScopes: desiredGroupScopes.size,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const canRetry = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2034"
        && attempt < 2;
      if (!canRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw new ConflictError("Не удалось обновить переписки", "DIALOG_SYNC_CONFLICT");
}

function uniqueDirectionByTitle(
  directions: Array<{ crmDirectionId: string; title: string; isActive: boolean }>,
) {
  const grouped = new Map<string, Array<{ crmDirectionId: string; title: string }>>();
  for (const direction of directions.filter((item) => item.isActive)) {
    const current = grouped.get(direction.title) ?? [];
    current.push(direction);
    grouped.set(direction.title, current);
  }
  return new Map([...grouped.entries()].flatMap(([title, matches]) => (
    matches.length === 1 ? [[title, matches[0]] as const] : []
  )));
}

export async function syncTeacherLearningDialogsFromCrm(teacherUserId: string) {
  if (!productFeatureConfig.flags.learningDialogsV2) {
    throw new ConflictError("Новый контур диалогов выключен", "LEARNING_DIALOGS_V2_DISABLED");
  }
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const [catalog, roster, groupRoster] = await Promise.all([
    fetchCrmDirections(),
    fetchTeacherStudents(crmTeacherId),
    fetchTeacherGroups(crmTeacherId),
  ]);
  if (!roster.teacher || !groupRoster.teacher) throw new NotFoundError("CRM teacher");

  const crmStudentIds = new Set([
    ...roster.students.map((student) => student.crmStudentId),
    ...groupRoster.groups.flatMap((group) => group.students.map((student) => student.crmStudentId)),
  ]);
  const linkedStudents = await prisma.user.findMany({
    where: {
      crmStudentId: { in: [...crmStudentIds] },
      isActive: true,
      deletedAt: null,
      role: { slug: "student" },
    },
    select: { id: true, crmStudentId: true },
  });
  const studentByCrmId = new Map(linkedStudents.flatMap((student) => (
    student.crmStudentId ? [[student.crmStudentId, student.id] as const] : []
  )));
  const parentLinks = await prisma.parentStudentLink.findMany({
    where: {
      studentUserId: { in: linkedStudents.map((student) => student.id) },
      isActive: true,
      revokedAt: null,
      parent: {
        isActive: true,
        deletedAt: null,
        role: { slug: "parent" },
      },
    },
    select: { studentUserId: true, parentUserId: true },
  });
  const parentIdsByStudent = new Map<string, string[]>();
  for (const link of parentLinks) {
    const current = parentIdsByStudent.get(link.studentUserId) ?? [];
    current.push(link.parentUserId);
    parentIdsByStudent.set(link.studentUserId, current);
  }
  const directionByTitle = uniqueDirectionByTitle(catalog.directions);
  const unmappedDirections = new Set<string>();

  const assignments: LearningDirectionAssignmentProjection[] = [];
  for (const student of roster.students) {
    const studentUserId = studentByCrmId.get(student.crmStudentId);
    if (!studentUserId) continue;
    for (const directionTitle of student.directions) {
      const direction = directionByTitle.get(directionTitle);
      if (!direction) {
        unmappedDirections.add(directionTitle);
        continue;
      }
      assignments.push({
        studentUserId,
        teacherUserId,
        crmDirectionId: direction.crmDirectionId,
        directionTitle,
        parentUserIds: [...new Set(parentIdsByStudent.get(studentUserId) ?? [])],
      });
    }
  }

  const groups: LearningGroupProjection[] = groupRoster.groups.map((group) => {
    const direction = directionByTitle.get(group.direction);
    if (!direction) unmappedDirections.add(group.direction);
    return {
      crmGroupId: group.crmGroupId,
      title: group.name,
      crmDirectionId: direction?.crmDirectionId ?? null,
      teacherUserId,
      studentUserIds: group.students.flatMap((student) => {
        const userId = studentByCrmId.get(student.crmStudentId);
        return userId ? [userId] : [];
      }),
    };
  });

  const result = await applyLearningDialogMembershipProjection({
    namespace: "crm",
    teacherUserId,
    syncedAt: new Date(),
    assignments,
    groups,
  });
  return {
    ...result,
    linkedStudents: linkedStudents.length,
    linkedParents: new Set(parentLinks.map((link) => link.parentUserId)).size,
    skippedStudents: crmStudentIds.size - linkedStudents.length,
    unmappedDirections: [...unmappedDirections].sort((left, right) => left.localeCompare(right, "ru")),
  };
}

export async function openTeacherStudentDialog(
  teacherUserId: string,
  studentUserId: string,
  recipient: "student" | "parent",
) {
  await syncTeacherLearningDialogsFromCrm(teacherUserId);

  const conversation = await prisma.learningConversation.findFirst({
    where: recipient === "parent"
      ? {
          type: "parent_teacher",
          status: "active",
          context: { path: ["studentUserId"], equals: studentUserId },
          members: {
            some: { userId: teacherUserId, role: "teacher", leftAt: null, canWrite: true },
          },
        }
      : {
          type: "learning_direction",
          status: "active",
          AND: [
            { members: { some: { userId: teacherUserId, role: "teacher", leftAt: null, canWrite: true } } },
            { members: { some: { userId: studentUserId, role: "student", leftAt: null, canWrite: true } } },
          ],
        },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      members: {
        where: recipient === "parent"
          ? { role: "parent", leftAt: null }
          : { role: "student", userId: studentUserId, leftAt: null },
        select: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              middleName: true,
              login: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    throw new BadRequestError(
      recipient === "parent"
        ? "У ученика пока нет подключённого родителя"
        : "Переписка с учеником пока недоступна",
      recipient === "parent" ? "PARENT_DIALOG_UNAVAILABLE" : "STUDENT_DIALOG_UNAVAILABLE",
    );
  }

  return {
    conversationId: conversation.id,
    recipients: conversation.members.map(({ user }) => (
      [user.lastName, user.firstName, user.middleName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ") || user.login || user.email
    )),
  };
}
