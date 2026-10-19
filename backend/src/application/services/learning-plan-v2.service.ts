import { randomUUID } from "node:crypto";
import { LearningPlanTopicState, LearningTopicProgressSource, Prisma } from "@prisma/client";
import { fetchTeacherGroupsForAccess, fetchTeacherStudentsForAccess } from "./teacher-substitution.service.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import {
  calculateMonthlyPlanProgress,
  type MonthlyPlanItemStatus,
} from "../../domain/monthly-plan.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
} from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import {
  requireCrmDirection,
  syncCrmDirectionProjection,
} from "./crm-direction-projection.service.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import {
  NON_EMPTY_PLAN_COMPLETION_POINTS,
  TOPIC_COMPLETION_POINTS,
} from "../../domain/product-economy-v2.js";
import { awardSystemPoints } from "./points.service.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PlanOwner =
  | { kind: "student"; crmStudentId: string; name: string }
  | { kind: "group"; crmGroupId: string; name: string };

export type LearningPlanV2ItemInput = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed";
  masteryCriteria?: string;
};

export type LearningPlanV2Input = {
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: LearningPlanV2ItemInput[];
  materials?: Array<{ id: string; title: string; url: string; note: string }>;
  expectedVersion?: number;
  /** Only when a new sector is opened: the step template it was started from. */
  templateStepId?: string | null;
  /** Ignored since plan 1.10: a sector closes with an exam, not a test. Old clients may still send it. */
  preparedTestId?: string | null;
};

type ResolvedScope = {
  owner: PlanOwner;
  direction: Awaited<ReturnType<typeof syncCrmDirectionProjection>>;
};

function ownerWhere(owner: PlanOwner) {
  return owner.kind === "student"
    ? { crmStudentId: owner.crmStudentId, crmGroupId: null }
    : { crmStudentId: null, crmGroupId: owner.crmGroupId };
}

async function resolveStudentScope(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
): Promise<ResolvedScope> {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherStudentsForAccess(crmTeacherId, { need: crmStudentId });
  const student = roster.students.find((item) => item.crmStudentId === crmStudentId);
  if (!student) {
    throw new BadRequestError("Этот ученик не назначен преподавателю", "STUDENT_NOT_ASSIGNED");
  }
  const crmDirection = await requireCrmDirection(crmDirectionId, student.directions);
  const direction = await syncCrmDirectionProjection(crmDirection);
  return {
    owner: { kind: "student", crmStudentId, name: student.name },
    direction,
  };
}

async function resolveGroupScope(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
): Promise<ResolvedScope> {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherGroupsForAccess(crmTeacherId, { need: crmGroupId });
  const group = roster.groups.find((item) => item.crmGroupId === crmGroupId);
  if (!group) {
    throw new BadRequestError("Эта группа не назначена преподавателю", "GROUP_NOT_ASSIGNED");
  }
  const crmDirection = await requireCrmDirection(crmDirectionId, [group.direction]);
  const direction = await syncCrmDirectionProjection(crmDirection);
  return {
    owner: { kind: "group", crmGroupId, name: group.name },
    direction,
  };
}

function normalizeInput(input: LearningPlanV2Input) {
  const seen = new Set<string>();
  const items = input.items.map((item) => {
    const id = item.id.trim();
    if (seen.has(id)) {
      throw new BadRequestError("Тема повторяется в плане", "MONTHLY_PLAN_TOPIC_DUPLICATE");
    }
    seen.add(id);
    return {
      id,
      title: item.title.trim(),
      status: item.status,
      masteryCriteria: item.masteryCriteria?.trim() ?? "",
    };
  });
  const materials = (input.materials ?? []).map((material) => ({
    id: material.id.trim(),
    title: material.title.trim(),
    url: material.url.trim(),
    note: material.note.trim(),
  })).filter((material) => material.title || material.url || material.note);

  return {
    goal: input.goal.trim(),
    expectedResult: input.expectedResult.trim(),
    skills: input.skills.trim(),
    checkpoint: input.checkpoint.trim(),
    note: input.note.trim(),
    items,
    materials,
  };
}

export function learningTopicStatus(progressPercent: number | null): MonthlyPlanItemStatus {
  if (progressPercent === 100) return "completed";
  if (progressPercent === 0) return "planned";
  return "in_progress";
}

function topicSourceKey(planId: string, clientItemId: string) {
  return `v2-plan-item:${planId}:${clientItemId}`;
}

function fullName(person: { firstName: string; lastName: string; middleName: string | null } | null) {
  if (!person) return "";
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(" ");
}

const planInclude = {
  direction: true,
  createdBy: { select: { firstName: true, lastName: true, middleName: true } },
  versions: {
    orderBy: { version: "desc" as const },
    include: {
      createdBy: { select: { firstName: true, lastName: true, middleName: true } },
      topics: {
        orderBy: { sortOrder: "asc" as const },
        include: { topic: true },
      },
    },
  },
} satisfies Prisma.LearningPlanInclude;

type PlanWithVersions = Prisma.LearningPlanGetPayload<{ include: typeof planInclude }>;

function versionDto(plan: PlanWithVersions, versionNumber = plan.currentVersionNumber) {
  const version = plan.versions.find((item) => item.version === versionNumber);
  if (!version) {
    throw new ConflictError("Версия учебного плана не найдена", "MONTHLY_PLAN_VERSION_MISSING");
  }
  const items = version.topics.map((link) => ({
    id: link.topic.id,
    title: link.titleSnapshot,
    masteryCriteria: link.masteryCriteriaSnapshot,
    status: link.state === LearningPlanTopicState.active
      ? learningTopicStatus(link.topic.progressPercent)
      : "moved" as const,
    progressPercent: link.topic.progressPercent,
    state: link.state,
  }));
  const activeItems = items.filter((item) => item.state === LearningPlanTopicState.active);
  const progress = calculateMonthlyPlanProgress(activeItems.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status === "moved" ? "planned" : item.status,
  })));
  const publishedVersion = plan.publishedVersionNumber
    ? plan.versions.find((item) => item.version === plan.publishedVersionNumber)
    : null;

  return {
    id: plan.id,
    model: "learning_topics_v2" as const,
    month: plan.month,
    sequence: plan.sequence,
    status: plan.status,
    closedAt: plan.closedAt,
    closeReason: plan.closeReason,
    templateStepId: plan.templateStepId,
    direction: {
      id: plan.direction.id,
      crmDirectionId: plan.direction.crmDirectionId,
      title: plan.direction.title,
      isActive: plan.direction.crmIsActive,
      syncedAt: plan.direction.crmSyncedAt,
    },
    goal: version.goal,
    expectedResult: version.expectedResult,
    skills: version.skills,
    checkpoint: version.checkpoint,
    note: version.note,
    materials: Array.isArray(version.materials) ? version.materials : [],
    items,
    progress: {
      ...progress,
      transferred: items.length - activeItems.length,
      originalTotal: items.length,
    },
    updatedAt: plan.updatedAt,
    publication: {
      isPublished: plan.publishedVersionNumber !== null,
      publishedAt: publishedVersion?.publishedAt ?? null,
      draftRevision: plan.currentVersionNumber,
      publishedRevision: plan.publishedVersionNumber ?? 0,
      hasUnpublishedChanges: plan.currentVersionNumber !== plan.publishedVersionNumber,
    },
    version: version.version,
    versions: plan.versions.map((item) => ({
      version: item.version,
      createdAt: item.createdAt,
      publishedAt: item.publishedAt,
      itemCount: item.topics.length,
      author: fullName(item.createdBy),
    })),
    teacher: { name: fullName(version.createdBy ?? plan.createdBy) },
  };
}

async function loadPlan(planId: string) {
  const plan = await prisma.learningPlan.findUnique({
    where: { id: planId },
    include: planInclude,
  });
  if (!plan) throw new ConflictError("Учебный план не найден", "MONTHLY_PLAN_NOT_FOUND");
  return plan;
}

/** The one open sector of this owner in this direction. */
async function findActiveSector(scope: ResolvedScope) {
  return prisma.learningPlan.findFirst({
    where: {
      directionId: scope.direction.id,
      status: "active",
      ...ownerWhere(scope.owner),
    },
    include: planInclude,
  });
}

async function listClosedSectors(scope: ResolvedScope) {
  const plans = await prisma.learningPlan.findMany({
    where: {
      directionId: scope.direction.id,
      status: "closed",
      ...ownerWhere(scope.owner),
    },
    include: planInclude,
    orderBy: { sequence: "desc" },
    take: 12,
  });
  return plans.map((plan) => {
    const dto = versionDto(plan, plan.publishedVersionNumber ?? plan.currentVersionNumber);
    return {
      id: plan.id,
      sequence: plan.sequence,
      goal: dto.goal,
      closedAt: plan.closedAt,
      closeReason: plan.closeReason,
      completedAt: plan.completedAt,
      topicsTotal: dto.progress.total,
      topicsCompleted: dto.progress.completed,
    };
  });
}

async function nextSectorSequence(tx: Prisma.TransactionClient, scope: ResolvedScope) {
  const last = await tx.learningPlan.aggregate({
    where: { directionId: scope.direction.id, ...ownerWhere(scope.owner) },
    _max: { sequence: true },
  });
  return (last._max.sequence ?? 0) + 1;
}

export function assertExpectedLearningPlanVersion(
  currentVersion: number,
  expectedVersion: number | undefined,
) {
  if (expectedVersion === undefined) {
    throw new ConflictError(
      "Версия плана не указана. Обновите страницу и повторите сохранение.",
      "MONTHLY_PLAN_EXPECTED_VERSION_REQUIRED",
    );
  }
  if (currentVersion !== expectedVersion) {
    throw new ConflictError(
      "План изменился. Обновите страницу и повторите действие.",
      "MONTHLY_PLAN_STALE_DRAFT",
    );
  }
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function savePlan(
  teacherUserId: string,
  scope: ResolvedScope,
  input: LearningPlanV2Input,
) {
  const normalized = normalizeInput(input);

  let result: { planId: string; idempotent: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
    // Saving always targets the open sector; when the last one is closed the
    // save opens the next sector in the sequence.
    let plan = await tx.learningPlan.findFirst({
      where: {
        directionId: scope.direction.id,
        status: "active",
        ...ownerWhere(scope.owner),
      },
    });

    if (!plan) {
      if (input.expectedVersion !== undefined && input.expectedVersion !== 0) {
        throw new ConflictError(
          "План уже изменился. Обновите страницу.",
          "MONTHLY_PLAN_STALE_DRAFT",
        );
      }
      let template: { id: string } | null = null;
      if (input.templateStepId) {
        template = await tx.sectorTemplate.findFirst({
          where: { id: input.templateStepId, isPublished: true },
          select: { id: true },
        });
        if (!template) throw new BadRequestError("Ступень программы не найдена", "SECTOR_TEMPLATE_NOT_FOUND");
      }
      plan = await tx.learningPlan.create({
        data: {
          id: randomUUID(),
          directionId: scope.direction.id,
          month: aqtobeMonthKey(),
          sequence: await nextSectorSequence(tx, scope),
          status: "active",
          templateStepId: template?.id ?? null,
          createdById: teacherUserId,
          ...ownerWhere(scope.owner),
        },
      });
    } else {
      assertExpectedLearningPlanVersion(plan.currentVersionNumber, input.expectedVersion);
      if (plan.lockedAt) {
        throw new ConflictError(
          "Завершённый план заблокирован для изменения состава",
          "MONTHLY_PLAN_LOCKED",
        );
      }
    }

    const currentVersion = plan.currentVersionNumber > 0
      ? await tx.learningPlanVersion.findUnique({
          where: { planId_version: { planId: plan.id, version: plan.currentVersionNumber } },
          include: { topics: { orderBy: { sortOrder: "asc" } } },
        })
      : null;
    const currentLinksByTopicId = new Map(
      (currentVersion?.topics ?? []).map((link) => [link.topicId, link]),
    );

    const requestedIds = normalized.items
      .map((item) => item.id)
      .filter((id) => UUID_PATTERN.test(id));
    const requestedSourceKeys = normalized.items.map((item) => topicSourceKey(plan.id, item.id));
    const knownTopics = await tx.learningTopic.findMany({
      where: {
        OR: [
          ...(requestedIds.length ? [{ id: { in: requestedIds } }] : []),
          { legacySourceKey: { in: requestedSourceKeys } },
        ],
      },
    });
    const byId = new Map(knownTopics.map((topic) => [topic.id, topic]));
    const bySource = new Map(knownTopics.map((topic) => [topic.legacySourceKey, topic]));
    const topicSnapshots: Array<{
      topicId: string;
      title: string;
      masteryCriteria: string;
      state: LearningPlanTopicState;
      sortOrder: number;
    }> = [];

    for (const [sortOrder, item] of normalized.items.entries()) {
      let topic = byId.get(item.id) ?? bySource.get(topicSourceKey(plan.id, item.id));
      const currentLink = topic ? currentLinksByTopicId.get(topic.id) : undefined;
      if (topic && (
        topic.directionId !== scope.direction.id
        || topic.crmStudentId !== (scope.owner.kind === "student" ? scope.owner.crmStudentId : null)
        || topic.crmGroupId !== (scope.owner.kind === "group" ? scope.owner.crmGroupId : null)
        || topic.archivedAt
      )) {
        throw new BadRequestError(
          "Тема не принадлежит выбранному ученику, группе или направлению",
          "LEARNING_TOPIC_SCOPE_MISMATCH",
        );
      }

      if (!topic) {
        if (item.status !== "planned") {
          throw new BadRequestError(
            "Прогресс новой темы меняется отдельной командой",
            "LEARNING_TOPIC_PROGRESS_COMMAND_REQUIRED",
          );
        }
        topic = await tx.learningTopic.create({
          data: {
            directionId: scope.direction.id,
            ...ownerWhere(scope.owner),
            title: item.title,
            masteryCriteria: item.masteryCriteria,
            progressPercent: 0,
            createdById: teacherUserId,
            responsibleTeacherId: teacherUserId,
            legacySourceKey: topicSourceKey(plan.id, item.id),
            progressHistory: {
              create: {
                fromPercent: null,
                toPercent: 0,
                source: LearningTopicProgressSource.teacher,
                sourceKey: `${topicSourceKey(plan.id, item.id)}:progress:create`,
                changedById: teacherUserId,
                occurredAt: new Date(),
              },
            },
          },
        });
      } else if (currentLink?.state === LearningPlanTopicState.active || !currentLink) {
        if (learningTopicStatus(topic.progressPercent) !== item.status) {
          throw new BadRequestError(
            "Прогресс темы меняется отдельной командой",
            "LEARNING_TOPIC_PROGRESS_COMMAND_REQUIRED",
          );
        }
        if (
          topic.title !== item.title
          || topic.masteryCriteria !== item.masteryCriteria
          || topic.responsibleTeacherId !== teacherUserId
        ) {
          topic = await tx.learningTopic.update({
            where: { id: topic.id },
            data: {
              title: item.title,
              masteryCriteria: item.masteryCriteria,
              responsibleTeacherId: teacherUserId,
            },
          });
        }
      }

      topicSnapshots.push({
        topicId: topic.id,
        title: currentLink && currentLink.state !== LearningPlanTopicState.active
          ? currentLink.titleSnapshot
          : item.title,
        masteryCriteria: currentLink && currentLink.state !== LearningPlanTopicState.active
          ? currentLink.masteryCriteriaSnapshot
          : item.masteryCriteria,
        state: currentLink?.state ?? LearningPlanTopicState.active,
        sortOrder,
      });
    }
    const unchanged = currentVersion
      && currentVersion.goal === normalized.goal
      && currentVersion.expectedResult === normalized.expectedResult
      && currentVersion.skills === normalized.skills
      && currentVersion.checkpoint === normalized.checkpoint
      && currentVersion.note === normalized.note
      && sameJson(currentVersion.materials, normalized.materials)
      && sameJson(
        currentVersion.topics.map((link) => ({
          topicId: link.topicId,
          title: link.titleSnapshot,
          masteryCriteria: link.masteryCriteriaSnapshot,
          state: link.state,
          sortOrder: link.sortOrder,
        })),
        topicSnapshots,
      );
    if (unchanged) return { planId: plan.id, idempotent: true };

    const nextVersion = plan.currentVersionNumber + 1;
    await tx.learningPlanVersion.create({
      data: {
        planId: plan.id,
        version: nextVersion,
        goal: normalized.goal,
        expectedResult: normalized.expectedResult,
        skills: normalized.skills,
        checkpoint: normalized.checkpoint,
        note: normalized.note,
        materials: normalized.materials as Prisma.InputJsonValue,
        createdById: teacherUserId,
        topics: {
          create: topicSnapshots.map((topic) => ({
            topicId: topic.topicId,
            titleSnapshot: topic.title,
            masteryCriteriaSnapshot: topic.masteryCriteria,
            state: topic.state,
            sortOrder: topic.sortOrder,
          })),
        },
      },
    });
    const updated = await tx.learningPlan.updateMany({
      where: {
        id: plan.id,
        currentVersionNumber: plan.currentVersionNumber,
        lockedAt: null,
      },
      data: { currentVersionNumber: nextVersion },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "План изменился. Обновите страницу и повторите сохранение.",
        "MONTHLY_PLAN_STALE_DRAFT",
      );
    }
    return { planId: plan.id, idempotent: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "Сектор уже открыт другим сохранением. Обновите страницу.",
        "MONTHLY_PLAN_ALREADY_EXISTS",
      );
    }
    throw error;
  }

  return { ...versionDto(await loadPlan(result.planId)), idempotent: result.idempotent };
}

async function publishPlan(
  teacherUserId: string,
  scope: ResolvedScope,
  expectedVersion: number | undefined,
) {
  const plan = await findActiveSector(scope);
  if (!plan) throw new BadRequestError("Открытый сектор не найден", "MONTHLY_PLAN_NOT_FOUND");
  assertExpectedLearningPlanVersion(plan.currentVersionNumber, expectedVersion);
  const current = versionDto(plan);
  if (!current.goal) throw new BadRequestError("Заполните цель сектора", "MONTHLY_PLAN_GOAL_REQUIRED");
  if (!current.items.some((item) => item.state === LearningPlanTopicState.active)) {
    throw new BadRequestError("Добавьте хотя бы одну тему", "MONTHLY_PLAN_ITEMS_REQUIRED");
  }
  if (plan.publishedVersionNumber === plan.currentVersionNumber) {
    return { ...current, idempotent: true, publicationEvent: null };
  }
  if (plan.lockedAt) {
    throw new ConflictError("Завершённый план заблокирован", "MONTHLY_PLAN_LOCKED");
  }

  const wasPublished = plan.publishedVersionNumber !== null;
  const publishedAt = new Date();
  const currentVersion = plan.versions.find(
    (version) => version.version === plan.currentVersionNumber,
  );
  if (!currentVersion) {
    throw new ConflictError("Версия учебного плана не найдена", "MONTHLY_PLAN_VERSION_MISSING");
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.learningPlan.updateMany({
      where: {
        id: plan.id,
        currentVersionNumber: plan.currentVersionNumber,
        publishedVersionNumber: plan.publishedVersionNumber,
        lockedAt: null,
      },
      data: { publishedVersionNumber: plan.currentVersionNumber },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "План изменился. Обновите страницу и повторите публикацию.",
        "MONTHLY_PLAN_STALE_DRAFT",
      );
    }
    await tx.learningPlanVersion.update({
      where: { planId_version: { planId: plan.id, version: plan.currentVersionNumber } },
      data: { publishedAt },
    });
  });

  if (scope.owner.kind === "student") {
    try {
      const studentUser = await prisma.user.findFirst({
        where: { crmStudentId: scope.owner.crmStudentId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (studentUser) {
        const { deliverUserNotification } = await import("./notification.service.js");
        await deliverUserNotification({
          userId: studentUser.id,
          type: "offline_lesson_report_ready",
          title: wasPublished ? `Сектор ${plan.sequence} обновлён` : `Сектор ${plan.sequence} открыт!`,
          body: `Цель: «${current.goal}». Посмотри темы сектора.`,
          url: "/monthly-plan",
          tag: `sector-v2-${scope.direction.crmDirectionId}-${plan.sequence}`,
          dedupeKey: `monthly-plan:${plan.id}:version:${plan.currentVersionNumber}`,
        });
      }
    } catch {
      // Publication succeeds even if notification delivery is temporarily unavailable.
    }
  }

  return {
    ...versionDto(await loadPlan(plan.id)),
    idempotent: false,
    publicationEvent: wasPublished ? "monthly_plan_republished" : "monthly_plan_published",
  };
}

export async function getStudentLearningPlanV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  const plan = await findActiveSector(scope);
  const history = await listClosedSectors(scope);
  return {
    student: { crmStudentId, name: scope.owner.name },
    direction: {
      crmDirectionId,
      title: scope.direction.title,
    },
    nextSequence: plan ? plan.sequence : (history[0]?.sequence ?? 0) + 1,
    plan: plan ? versionDto(plan) : null,
    history,
  };
}

export async function saveStudentLearningPlanV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  input: LearningPlanV2Input,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return savePlan(teacherUserId, scope, input);
}

export async function publishStudentLearningPlanV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  expectedVersion: number | undefined,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return publishPlan(teacherUserId, scope, expectedVersion);
}

/** The most a teacher may pay for a sector closed early: the full completion reward. */
export const SECTOR_EARLY_CLOSE_MAX_POINTS = NON_EMPTY_PLAN_COMPLETION_POINTS;

/**
 * Decision 19.10: the teacher may close the open sector before every topic is
 * at 100 % and writes the Points it is worth, 0–250. The payment uses the same
 * completion key as the automatic one, so a sector is never paid twice, and
 * the next sector can be opened right after.
 */
export async function closeStudentSectorEarlyV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  input: { points: number; comment?: string | null; now?: Date },
) {
  if (!Number.isInteger(input.points) || input.points < 0 || input.points > SECTOR_EARLY_CLOSE_MAX_POINTS) {
    throw new BadRequestError(
      `Баллы за досрочное закрытие: целое число от 0 до ${SECTOR_EARLY_CLOSE_MAX_POINTS}`,
      "SECTOR_EARLY_CLOSE_POINTS_INVALID",
    );
  }
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  const plan = await findActiveSector(scope);
  if (!plan) throw new BadRequestError("Открытый сектор не найден", "MONTHLY_PLAN_NOT_FOUND");
  if (plan.publishedVersionNumber === null) {
    throw new BadRequestError("Сектор ещё не опубликован ученику: закрывать нечего", "SECTOR_NOT_PUBLISHED");
  }
  const now = input.now ?? new Date();
  const completionSourceKey = `learning-plan-completion:${plan.id}`;
  const closed = await prisma.learningPlan.updateMany({
    where: { id: plan.id, status: "active" },
    data: {
      status: "closed",
      closedAt: now,
      closeReason: "manual",
      completedAt: plan.completedAt ?? now,
      lockedAt: plan.lockedAt ?? now,
      completionRewardSourceKey: plan.completionRewardSourceKey ?? completionSourceKey,
    },
  });
  if (closed.count === 0) {
    throw new ConflictError("Сектор уже закрыт. Обновите страницу.", "SECTOR_ALREADY_CLOSED");
  }
  // An exam prepared for this sector has nothing left to close.
  await prisma.sectorExam.updateMany({
    where: { planId: plan.id, status: { in: ["draft", "awaiting_schedule", "scheduled", "in_progress"] } },
    data: { status: "cancelled", cancelledAt: now, cancelReason: "Сектор закрыт досрочно" },
  });

  const studentUser = await prisma.user.findFirst({
    where: { crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
    select: { id: true },
  });
  let awardedPoints = 0;
  if (studentUser && input.points > 0 && !plan.completionRewardSourceKey) {
    const award = await awardSystemPoints({
      studentId: studentUser.id,
      amount: input.points,
      reason: `Сектор ${plan.sequence} закрыт досрочно`,
      sourceKey: `${completionSourceKey}:${studentUser.id}`,
      eventAt: now,
    });
    awardedPoints = award.awarded ? input.points : 0;
  }
  if (studentUser) {
    try {
      const { deliverUserNotification } = await import("./notification.service.js");
      await deliverUserNotification({
        userId: studentUser.id,
        type: "offline_lesson_report_ready",
        title: `Сектор ${plan.sequence} закрыт`,
        body: awardedPoints
          ? `Преподаватель закрыл сектор. Начислено ${awardedPoints} баллов.`
          : "Преподаватель закрыл сектор. Скоро откроется следующий.",
        url: "/monthly-plan",
        tag: `sector-closed-${plan.id}`,
        dedupeKey: `sector-closed:${plan.id}`,
      });
    } catch {
      // Closing succeeds even if notification delivery is temporarily unavailable.
    }
  }

  return { ...versionDto(await loadPlan(plan.id)), awardedPoints };
}

export async function getGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  const plan = await findActiveSector(scope);
  const history = await listClosedSectors(scope);
  return {
    group: { crmGroupId, name: scope.owner.name },
    direction: {
      crmDirectionId,
      title: scope.direction.title,
    },
    nextSequence: plan ? plan.sequence : (history[0]?.sequence ?? 0) + 1,
    plan: plan ? versionDto(plan) : null,
    history,
  };
}

export async function saveGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  input: LearningPlanV2Input,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return savePlan(teacherUserId, scope, input);
}

export async function publishGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  expectedVersion: number | undefined,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return publishPlan(teacherUserId, scope, expectedVersion);
}

/**
 * Sectors a student sees: the active published sector per direction (own and of
 * the groups they are in) plus closed sectors as history.
 */
export async function listPublishedLearningPlansV2(
  crmStudentId: string,
  crmGroupIds: readonly string[],
  options: { includeClosed?: boolean } = {},
) {
  const ownerScope = [
    { crmStudentId, crmGroupId: null },
    ...(crmGroupIds.length ? [{ crmStudentId: null, crmGroupId: { in: [...crmGroupIds] } }] : []),
  ];
  const plans = await prisma.learningPlan.findMany({
    where: {
      publishedVersionNumber: { not: null },
      ...(options.includeClosed ? {} : { status: "active" }),
      OR: ownerScope,
    },
    include: planInclude,
    orderBy: [{ status: "asc" }, { sequence: "desc" }, { updatedAt: "desc" }],
  });
  const examByPlan = await publicSectorExams(plans.map((plan) => plan.id));

  return plans.flatMap((plan) => {
    if (!plan.publishedVersionNumber) return [];
    const dto = versionDto(plan, plan.publishedVersionNumber);
    return [{
      id: dto.id,
      scope: plan.crmStudentId ? "student" as const : "group" as const,
      targetId: plan.crmStudentId ?? plan.crmGroupId ?? "",
      month: plan.month,
      sequence: plan.sequence,
      status: plan.status,
      closedAt: plan.closedAt,
      exam: examByPlan.get(plan.id) ?? null,
      direction: dto.direction,
      teacher: dto.teacher,
      goal: dto.goal,
      expectedResult: dto.expectedResult,
      skills: dto.skills,
      materials: dto.materials,
      items: dto.items,
      progress: dto.progress,
      publishedAt: dto.publication.publishedAt,
    }];
  });
}

async function requireTopicScope(teacherUserId: string, topicId: string) {
  const topic = await prisma.learningTopic.findUnique({
    where: { id: topicId },
    include: {
      direction: true,
      progressHistory: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!topic || topic.archivedAt) {
    throw new BadRequestError("Учебная тема не найдена", "LEARNING_TOPIC_NOT_FOUND");
  }
  if (!topic.direction.crmDirectionId) {
    throw new ConflictError(
      "У темы нет однозначной связи с направлением CRM",
      "CRM_DIRECTION_MAPPING_REQUIRED",
    );
  }
  if (topic.crmStudentId) {
    await resolveStudentScope(
      teacherUserId,
      topic.crmStudentId,
      topic.direction.crmDirectionId,
    );
  } else if (topic.crmGroupId) {
    await resolveGroupScope(
      teacherUserId,
      topic.crmGroupId,
      topic.direction.crmDirectionId,
    );
  } else {
    throw new ConflictError("У темы не определён владелец", "LEARNING_TOPIC_OWNER_MISSING");
  }
  return topic;
}

function topicDto(topic: Awaited<ReturnType<typeof requireTopicScope>>) {
  return {
    id: topic.id,
    crmStudentId: topic.crmStudentId,
    crmGroupId: topic.crmGroupId,
    direction: {
      crmDirectionId: topic.direction.crmDirectionId,
      title: topic.direction.title,
    },
    title: topic.title,
    masteryCriteria: topic.masteryCriteria,
    progressPercent: topic.progressPercent,
    status: learningTopicStatus(topic.progressPercent),
    masteredAt: topic.masteredAt,
    history: topic.progressHistory.map((event) => ({
      id: event.id,
      fromPercent: event.fromPercent,
      toPercent: event.toPercent,
      source: event.source,
      sourceKey: event.sourceKey,
      comment: event.comment,
      changedById: event.changedById,
      occurredAt: event.occurredAt,
    })),
  };
}

export async function getLearningTopicV2(teacherUserId: string, topicId: string) {
  return topicDto(await requireTopicScope(teacherUserId, topicId));
}

export function validateOutsideLessonTopicProgress(input: {
  currentPercent: number | null;
  expectedPercent: number | null;
  toPercent: number;
}) {
  if (!Number.isInteger(input.toPercent) || input.toPercent < 0 || input.toPercent > 100) {
    throw new BadRequestError(
      "Процент темы должен быть целым числом от 0 до 100",
      "LEARNING_TOPIC_PROGRESS_INVALID",
    );
  }
  if (input.toPercent === 100) {
    throw new BadRequestError(
      "100% подтверждается только внутри проведённого урока",
      "LEARNING_TOPIC_100_REQUIRES_LESSON",
    );
  }
  if (input.currentPercent === 100) {
    throw new ConflictError(
      "Освоенная тема заблокирована. Исправление 100% выполняется отдельным административным действием.",
      "LEARNING_TOPIC_MASTERED_LOCKED",
    );
  }
  if (input.currentPercent !== input.expectedPercent) {
    throw new ConflictError(
      "Процент темы изменился. Обновите страницу и повторите действие.",
      "LEARNING_TOPIC_STALE_PROGRESS",
    );
  }
}

export async function updateLearningTopicProgressV2(
  teacherUserId: string,
  topicId: string,
  input: {
    toPercent: number;
    expectedPercent: number | null;
    sourceKey: string;
    comment?: string;
  },
) {
  const scoped = await requireTopicScope(teacherUserId, topicId);
  const existingEvent = await prisma.learningTopicProgress.findUnique({
    where: { sourceKey: input.sourceKey },
  });
  if (existingEvent) {
    if (existingEvent.topicId !== topicId || existingEvent.toPercent !== input.toPercent) {
      throw new ConflictError(
        "Ключ события уже использован для другого изменения",
        "LEARNING_TOPIC_SOURCE_KEY_CONFLICT",
      );
    }
    return { ...topicDto(scoped), idempotent: true };
  }
  validateOutsideLessonTopicProgress({
    currentPercent: scoped.progressPercent,
    expectedPercent: input.expectedPercent,
    toPercent: input.toPercent,
  });
  if (scoped.progressPercent === input.toPercent) {
    return { ...topicDto(scoped), idempotent: true };
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.learningTopic.updateMany({
      where: {
        id: topicId,
        progressPercent: input.expectedPercent,
        archivedAt: null,
      },
      data: { progressPercent: input.toPercent },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "Процент темы изменился. Обновите страницу и повторите действие.",
        "LEARNING_TOPIC_STALE_PROGRESS",
      );
    }
    await tx.learningTopicProgress.create({
      data: {
        topicId,
        fromPercent: input.expectedPercent,
        toPercent: input.toPercent,
        source: LearningTopicProgressSource.teacher,
        sourceKey: input.sourceKey,
        comment: input.comment?.trim() || null,
        changedById: teacherUserId,
        occurredAt: new Date(),
      },
    });
  });

  return {
    ...topicDto(await requireTopicScope(teacherUserId, topicId)),
    idempotent: false,
  };
}

async function requireLessonTopicScope(actorUserId: string, topicId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    include: { role: { select: { slug: true } } },
  });
  if (!actor) {
    throw new BadRequestError("Пользователь не найден", "USER_NOT_FOUND");
  }
  if (actor.role.slug === "teacher") {
    return requireTopicScope(actorUserId, topicId);
  }
  if (!isOfflineCoordinatorRole(actor.role.slug)) {
    throw new BadRequestError(
      "Изменение учебной темы недоступно",
      "LEARNING_TOPIC_ACCESS_DENIED",
    );
  }
  const topic = await prisma.learningTopic.findUnique({
    where: { id: topicId },
    include: {
      direction: true,
      progressHistory: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!topic || topic.archivedAt) {
    throw new BadRequestError("Учебная тема не найдена", "LEARNING_TOPIC_NOT_FOUND");
  }
  return topic;
}

/**
 * Who receives the 100 Points for a topic closed in a lesson.
 * A group topic is paid only to the students present in the immutable attendance
 * snapshot of the approved report version; without a snapshot nobody is paid,
 * because the live CRM roster also lists students who missed the lesson.
 */
export function topicRewardCrmStudentIds(
  topic: { crmStudentId: string | null; crmGroupId: string | null },
  immutableRecipientCrmStudentIds?: readonly string[],
) {
  if (topic.crmStudentId) {
    if (immutableRecipientCrmStudentIds === undefined) return [topic.crmStudentId];
    const present = new Set(immutableRecipientCrmStudentIds.map((id) => id.trim()).filter(Boolean));
    return present.has(topic.crmStudentId) ? [topic.crmStudentId] : [];
  }
  if (!topic.crmGroupId || immutableRecipientCrmStudentIds === undefined) return [];
  return [...new Set(immutableRecipientCrmStudentIds.map((id) => id.trim()).filter(Boolean))];
}

async function resolveTopicRewardStudents(
  topic: { crmStudentId: string | null; crmGroupId: string | null },
  _crmClassId: string,
  immutableRecipientCrmStudentIds?: readonly string[],
) {
  const crmStudentIds = topicRewardCrmStudentIds(topic, immutableRecipientCrmStudentIds);

  return prisma.user.findMany({
    where: {
      crmStudentId: { in: [...new Set(crmStudentIds)] },
      deletedAt: null,
      isActive: true,
      role: { slug: "student" },
    },
    select: { id: true },
  });
}

async function applyTopicMasteryRewards(params: {
  topic: Awaited<ReturnType<typeof requireLessonTopicScope>>;
  crmClassId: string;
  occurredAt: Date;
  immutableRecipientCrmStudentIds?: readonly string[];
}) {
  if (!rewardEconomyV2AppliesToEvent(params.occurredAt)) return;

  const students = await resolveTopicRewardStudents(
    params.topic,
    params.crmClassId,
    params.immutableRecipientCrmStudentIds,
  );
  for (const student of students) {
    await awardSystemPoints({
      studentId: student.id,
      amount: TOPIC_COMPLETION_POINTS,
      reason: `Освоена тема «${params.topic.title}»`,
      sourceKey: `learning-topic-mastery:${params.topic.id}:${student.id}`,
      eventAt: params.occurredAt,
    });
  }

  const plans = await prisma.learningPlan.findMany({
    where: {
      directionId: params.topic.directionId,
      crmStudentId: params.topic.crmStudentId,
      crmGroupId: params.topic.crmGroupId,
      publishedVersionNumber: { not: null },
      versions: { some: { topics: { some: { topicId: params.topic.id } } } },
    },
    include: planInclude,
  });
  for (const plan of plans) {
    const publishedVersion = plan.versions.find((version) => version.version === plan.publishedVersionNumber);
    if (!publishedVersion?.topics.some((link) => link.topicId === params.topic.id)) continue;
    await closeSectorIfComplete(plan, students, params.occurredAt);
  }
}

type SectorForClosing = Prisma.LearningPlanGetPayload<{ include: typeof planInclude }>;

/**
 * A sector closes once every active topic of its published version is at 100 %
 * and its test (if any) is passed. Closing is what pays the 250 Points and
 * what lets the teacher open the next sector.
 */
async function closeSectorIfComplete(
  plan: SectorForClosing,
  students: Array<{ id: string }>,
  occurredAt: Date,
) {
  const publishedVersion = plan.versions.find((version) => version.version === plan.publishedVersionNumber);
  if (!publishedVersion) return false;
  const activeTopics = publishedVersion.topics.filter((link) => link.state === LearningPlanTopicState.active);
  if (!activeTopics.length || activeTopics.some((link) => link.topic.progressPercent !== 100)) return false;
  // Plan 1.10: an individual sector waits for its exam; the teacher closes it after the exam.
  // Group sectors keep closing on their own until group exams arrive (plan 1.13).
  if (plan.crmStudentId) return false;

  const completionSourceKey = `learning-plan-completion:${plan.id}`;
  if (plan.completionRewardSourceKey?.includes("blocked-before-cutover")) return false;
  if (plan.completionRewardSourceKey && plan.completionRewardSourceKey !== completionSourceKey) return false;

  if (!plan.completionRewardSourceKey) {
    await prisma.learningPlan.updateMany({
      where: { id: plan.id, completionRewardSourceKey: null },
      data: {
        completionRewardSourceKey: completionSourceKey,
        completedAt: occurredAt,
        lockedAt: occurredAt,
        status: "closed",
        closedAt: occurredAt,
        closeReason: "completed",
      },
    });
  } else if (plan.status !== "closed") {
    await prisma.learningPlan.update({
      where: { id: plan.id },
      data: { status: "closed", closedAt: plan.completedAt ?? occurredAt, closeReason: "completed" },
    });
  }

  if (rewardEconomyV2AppliesToEvent(occurredAt)) {
    for (const student of students) {
      await awardSystemPoints({
        studentId: student.id,
        amount: NON_EMPTY_PLAN_COMPLETION_POINTS,
        reason: `Закрыт сектор ${plan.sequence}`,
        sourceKey: `${completionSourceKey}:${student.id}`,
        eventAt: occurredAt,
      });
    }
  }
  return true;
}

export type LearningTopicProgressFromLessonV2Input = {
  topicId: string;
  toPercent: number;
  expectedPercent: number | null;
  comment?: string;
};

type PreparedLearningTopicProgressFromLessonV2 = {
  update: LearningTopicProgressFromLessonV2Input;
  sourceKey: string;
  alreadyApplied: boolean;
  noChange: boolean;
  masteryStudents: Array<{ id: string }>;
};

function validateLessonTopicProgressPercent(toPercent: number) {
  if (!Number.isInteger(toPercent) || toPercent < 0 || toPercent > 100) {
    throw new BadRequestError(
      "Процент темы должен быть целым числом от 0 до 100",
      "LEARNING_TOPIC_PROGRESS_INVALID",
    );
  }
}

export async function updateLearningTopicProgressBatchFromLessonV2(
  actorUserId: string,
  crmClassId: string,
  updates: readonly LearningTopicProgressFromLessonV2Input[],
  options: {
    occurredAt?: Date;
    rewardRecipientCrmStudentIds?: readonly string[];
  } = {},
) {
  const topicIds = updates.map((update) => update.topicId);
  if (new Set(topicIds).size !== topicIds.length) {
    throw new BadRequestError("Одна тема указана несколько раз", "LESSON_TOPIC_DUPLICATE");
  }
  const occurredAt = options.occurredAt ?? new Date();
  const prepared: PreparedLearningTopicProgressFromLessonV2[] = [];

  // Resolve access, optimistic versions, idempotency receipts and reward recipients before
  // opening the transaction. The transaction itself then contains only deterministic DB writes.
  for (const update of updates) {
    validateLessonTopicProgressPercent(update.toPercent);
    const scoped = await requireLessonTopicScope(actorUserId, update.topicId);
    const sourceKey = `offline-lesson:${crmClassId}:topic:${update.topicId}`;
    const existingEvent = await prisma.learningTopicProgress.findUnique({
      where: { sourceKey },
    });
    if (existingEvent) {
      if (!sameLearningTopicProgressRequest(existingEvent, update)) {
        throw new ConflictError(
          "Прогресс этой темы уже зафиксирован в итогах урока",
          "LESSON_TOPIC_PROGRESS_ALREADY_RECORDED",
        );
      }
      prepared.push({
        update,
        sourceKey,
        alreadyApplied: true,
        noChange: false,
        masteryStudents: [],
      });
      continue;
    }
    if (scoped.progressPercent === 100) {
      throw new ConflictError(
        "Освоенная тема заблокирована. Исправление выполняется куратором отдельным действием.",
        "LEARNING_TOPIC_MASTERED_LOCKED",
      );
    }
    if (scoped.progressPercent !== update.expectedPercent) {
      throw new ConflictError(
        "Процент темы изменился. Обновите урок и повторите действие.",
        "LEARNING_TOPIC_STALE_PROGRESS",
      );
    }
    if (scoped.progressPercent === update.toPercent) {
      prepared.push({
        update,
        sourceKey,
        alreadyApplied: false,
        noChange: true,
        masteryStudents: [],
      });
      continue;
    }
    const masteryStudents = update.toPercent === 100 && rewardEconomyV2AppliesToEvent(occurredAt)
      ? await resolveTopicRewardStudents(
          scoped,
          crmClassId,
          options.rewardRecipientCrmStudentIds,
        )
      : [];
    prepared.push({
      update,
      sourceKey,
      alreadyApplied: false,
      noChange: false,
      masteryStudents,
    });
  }

  const writes = prepared
    .filter((item) => !item.alreadyApplied && !item.noChange)
    .sort((left, right) => left.update.topicId.localeCompare(right.update.topicId));
  let recoveredConcurrentReplay = false;
  if (writes.length) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of writes) {
          const updated = await tx.learningTopic.updateMany({
            where: {
              id: item.update.topicId,
              progressPercent: item.update.expectedPercent,
              archivedAt: null,
            },
            data: {
              progressPercent: item.update.toPercent,
              ...(item.update.toPercent === 100
                ? {
                    masteredAt: occurredAt,
                    masteryRewardSourceKey: item.masteryStudents.length
                      ? `learning-topic-mastery:${item.update.topicId}`
                      : null,
                  }
                : {}),
            },
          });
          if (updated.count !== 1) {
            throw new ConflictError(
              "Процент темы изменился. Обновите урок и повторите действие.",
              "LEARNING_TOPIC_STALE_PROGRESS",
            );
          }
          await tx.learningTopicProgress.create({
            data: {
              topicId: item.update.topicId,
              fromPercent: item.update.expectedPercent,
              toPercent: item.update.toPercent,
              source: LearningTopicProgressSource.lesson,
              sourceKey: item.sourceKey,
              comment: item.update.comment?.trim() || null,
              changedById: actorUserId,
              occurredAt,
            },
          });
        }
      });
    } catch (error) {
      const duplicateRace = (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) || (
        error instanceof ConflictError
        && error.code === "LEARNING_TOPIC_STALE_PROGRESS"
      );
      if (!duplicateRace) throw error;
      const committedEvents = await prisma.learningTopicProgress.findMany({
        where: { sourceKey: { in: writes.map((item) => item.sourceKey) } },
      });
      const committedBySourceKey = new Map(
        committedEvents.map((event) => [event.sourceKey, event]),
      );
      if (!writes.every((item) => {
        const event = committedBySourceKey.get(item.sourceKey);
        return event && sameLearningTopicProgressRequest(event, item.update);
      })) {
        throw error;
      }
      recoveredConcurrentReplay = true;
    }
  }

  const committedEvents = await prisma.learningTopicProgress.findMany({
    where: { sourceKey: { in: prepared.map((item) => item.sourceKey) } },
  });
  const committedBySourceKey = new Map(committedEvents.map((event) => [event.sourceKey, event]));
  const results = [];
  for (const item of prepared) {
    const current = await requireLessonTopicScope(actorUserId, item.update.topicId);
    const committedEvent = committedBySourceKey.get(item.sourceKey);
    if (item.update.toPercent === 100 && committedEvent) {
      await applyTopicMasteryRewards({
        topic: current,
        crmClassId,
        occurredAt: committedEvent.occurredAt,
        immutableRecipientCrmStudentIds: options.rewardRecipientCrmStudentIds,
      });
    }
    results.push({
      ...topicDto(current),
      idempotent: item.alreadyApplied || item.noChange || recoveredConcurrentReplay,
    });
  }
  return results;
}

export async function updateLearningTopicProgressFromLessonV2(
  actorUserId: string,
  topicId: string,
  input: {
    crmClassId: string;
    toPercent: number;
    expectedPercent: number | null;
    comment?: string;
    occurredAt?: Date;
    rewardRecipientCrmStudentIds?: readonly string[];
  },
) {
  const [result] = await updateLearningTopicProgressBatchFromLessonV2(
    actorUserId,
    input.crmClassId,
    [{
      topicId,
      expectedPercent: input.expectedPercent,
      toPercent: input.toPercent,
      comment: input.comment,
    }],
    {
      occurredAt: input.occurredAt,
      rewardRecipientCrmStudentIds: input.rewardRecipientCrmStudentIds,
    },
  );
  return result!;
}

export function sameLearningTopicProgressRequest(
  existing: { topicId: string; toPercent: number },
  requested: { topicId: string; toPercent: number },
) {
  return existing.topicId === requested.topicId
    && existing.toPercent === requested.toPercent;
}


/** What the student and parent see of a sector's exam: the latest one that left the draft. */
async function publicSectorExams(planIds: string[]) {
  if (!planIds.length) return new Map<string, ReturnType<typeof publicSectorExamDto>>();
  const exams = await prisma.sectorExam.findMany({
    where: { planId: { in: planIds }, status: { notIn: ["draft", "cancelled"] } },
    include: { items: { orderBy: { position: "asc" } }, results: true },
    orderBy: [{ attempt: "desc" }, { createdAt: "desc" }],
  });
  const byPlan = new Map<string, ReturnType<typeof publicSectorExamDto>>();
  for (const exam of exams) {
    if (!byPlan.has(exam.planId)) byPlan.set(exam.planId, publicSectorExamDto(exam));
  }
  return byPlan;
}

export function publicSectorExamDto(exam: {
  id: string;
  status: string;
  attempt: number;
  scheduledAt: Date | null;
  finishedAt: Date | null;
  outcome: string | null;
  certificateNumber: string | null;
  certificateIssuedAt: Date | null;
  items: Array<{ id: string; title: string; criteria: string }>;
  results: Array<{ itemId: string; done: boolean }>;
}) {
  const completed = exam.status === "completed";
  const doneByItem = new Map(exam.results.map((result) => [result.itemId, result.done]));
  return {
    id: exam.id,
    status: exam.status as "awaiting_schedule" | "scheduled" | "in_progress" | "completed",
    attempt: exam.attempt,
    scheduledAt: exam.scheduledAt,
    finishedAt: exam.finishedAt,
    outcome: completed ? exam.outcome as "passed" | "partial" | "failed" | null : null,
    certificate: exam.certificateNumber
      ? { number: exam.certificateNumber, issuedAt: exam.certificateIssuedAt }
      : null,
    // Marks show once the exam is over, not while the teacher is still going through the list.
    items: exam.items.map((item) => ({
      id: item.id,
      title: item.title,
      criteria: item.criteria,
      done: completed ? doneByItem.get(item.id) ?? null : null,
    })),
  };
}

/**
 * Plan 1.10: the teacher closes an individual sector after its exam, whatever the outcome.
 * Pays the 250 Points of a closed sector with the same key as every other close, so a
 * sector is never paid twice. Returns false when the sector was already closed.
 */
export async function closeStudentSectorByExam(planId: string, input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const plan = await prisma.learningPlan.findUnique({ where: { id: planId } });
  if (!plan?.crmStudentId) return { closed: false, awardedPoints: 0 };
  const completionSourceKey = `learning-plan-completion:${plan.id}`;
  const closed = await prisma.learningPlan.updateMany({
    where: { id: plan.id, status: "active" },
    data: {
      status: "closed",
      closedAt: now,
      closeReason: "exam",
      completedAt: plan.completedAt ?? now,
      lockedAt: plan.lockedAt ?? now,
      completionRewardSourceKey: plan.completionRewardSourceKey ?? completionSourceKey,
    },
  });
  if (closed.count === 0) return { closed: false, awardedPoints: 0 };
  const studentUser = await prisma.user.findFirst({
    where: { crmStudentId: plan.crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
    select: { id: true },
  });
  let awardedPoints = 0;
  // Like the early close, an exam close happens live after the economy cutover: no legacy gate.
  if (studentUser && !plan.completionRewardSourceKey) {
    const award = await awardSystemPoints({
      studentId: studentUser.id,
      amount: NON_EMPTY_PLAN_COMPLETION_POINTS,
      reason: `Закрыт сектор ${plan.sequence}`,
      sourceKey: `${completionSourceKey}:${studentUser.id}`,
      eventAt: now,
    });
    awardedPoints = award.awarded ? NON_EMPTY_PLAN_COMPLETION_POINTS : 0;
  }
  return { closed: true, awardedPoints, sequence: plan.sequence, studentUserId: studentUser?.id ?? null };
}
