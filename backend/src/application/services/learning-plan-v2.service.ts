import { randomUUID } from "node:crypto";
import { LearningPlanTopicState, LearningTopicProgressSource, Prisma } from "@prisma/client";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import {
  calculateMonthlyPlanProgress,
  type MonthlyPlanItemStatus,
} from "../../domain/monthly-plan.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassStudents,
  fetchTeacherGroups,
  fetchTeacherStudents,
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
  const roster = await fetchTeacherStudents(crmTeacherId);
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
  const roster = await fetchTeacherGroups(crmTeacherId);
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
  const progress = calculateMonthlyPlanProgress(items.map((item) => ({
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
    progress,
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

async function findPlan(scope: ResolvedScope, month: string) {
  return prisma.learningPlan.findFirst({
    where: {
      directionId: scope.direction.id,
      month,
      ...ownerWhere(scope.owner),
    },
    include: planInclude,
  });
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
  month: string,
  input: LearningPlanV2Input,
) {
  const normalized = normalizeInput(input);

  let result: { planId: string; idempotent: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
    let plan = await tx.learningPlan.findFirst({
      where: {
        directionId: scope.direction.id,
        month,
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
      plan = await tx.learningPlan.create({
        data: {
          id: randomUUID(),
          directionId: scope.direction.id,
          month,
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
      } else {
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
        title: item.title,
        masteryCriteria: item.masteryCriteria,
        state: LearningPlanTopicState.active,
        sortOrder,
      });
    }

    const currentVersion = plan.currentVersionNumber > 0
      ? await tx.learningPlanVersion.findUnique({
          where: { planId_version: { planId: plan.id, version: plan.currentVersionNumber } },
          include: { topics: { orderBy: { sortOrder: "asc" } } },
        })
      : null;
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
        "План на это направление и месяц уже создан. Обновите страницу.",
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
  month: string,
  expectedVersion: number | undefined,
) {
  const plan = await findPlan(scope, month);
  if (!plan) throw new BadRequestError("План месяца не найден", "MONTHLY_PLAN_NOT_FOUND");
  assertExpectedLearningPlanVersion(plan.currentVersionNumber, expectedVersion);
  const current = versionDto(plan);
  if (!current.goal) throw new BadRequestError("Заполните фокус месяца", "MONTHLY_PLAN_GOAL_REQUIRED");
  if (!current.items.length) throw new BadRequestError("Добавьте хотя бы одну тему", "MONTHLY_PLAN_ITEMS_REQUIRED");
  if (plan.publishedVersionNumber === plan.currentVersionNumber) {
    return { ...current, idempotent: true, publicationEvent: null };
  }
  if (plan.lockedAt) {
    throw new ConflictError("Завершённый план заблокирован", "MONTHLY_PLAN_LOCKED");
  }

  const wasPublished = plan.publishedVersionNumber !== null;
  const publishedAt = new Date();
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
          title: `Учебный план на ${month} готов!`,
          body: `Цель месяца: «${current.goal}». Посмотри темы в плане месяца.`,
          url: "/monthly-plan",
          tag: `monthly-plan-v2-${scope.direction.crmDirectionId}-${month}`,
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
  month: string,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  const plan = await findPlan(scope, month);
  return {
    student: { crmStudentId, name: scope.owner.name },
    direction: {
      crmDirectionId,
      title: scope.direction.title,
    },
    month,
    plan: plan ? versionDto(plan) : null,
  };
}

export async function saveStudentLearningPlanV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  month: string,
  input: LearningPlanV2Input,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return savePlan(teacherUserId, scope, month, input);
}

export async function publishStudentLearningPlanV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  month: string,
  expectedVersion: number | undefined,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return publishPlan(teacherUserId, scope, month, expectedVersion);
}

export async function getGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  month: string,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  const plan = await findPlan(scope, month);
  return {
    group: { crmGroupId, name: scope.owner.name },
    direction: {
      crmDirectionId,
      title: scope.direction.title,
    },
    month,
    plan: plan ? versionDto(plan) : null,
  };
}

export async function saveGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  month: string,
  input: LearningPlanV2Input,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return savePlan(teacherUserId, scope, month, input);
}

export async function publishGroupLearningPlanV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  month: string,
  expectedVersion: number | undefined,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return publishPlan(teacherUserId, scope, month, expectedVersion);
}

export async function listPublishedLearningPlansV2(
  crmStudentId: string,
  crmGroupIds: readonly string[],
  month: string,
) {
  const plans = await prisma.learningPlan.findMany({
    where: {
      month,
      publishedVersionNumber: { not: null },
      OR: [
        { crmStudentId, crmGroupId: null },
        ...(crmGroupIds.length ? [{ crmStudentId: null, crmGroupId: { in: [...crmGroupIds] } }] : []),
      ],
    },
    include: planInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });

  return plans.flatMap((plan) => {
    if (!plan.publishedVersionNumber) return [];
    const dto = versionDto(plan, plan.publishedVersionNumber);
    return [{
      id: dto.id,
      scope: plan.crmStudentId ? "student" as const : "group" as const,
      targetId: plan.crmStudentId ?? plan.crmGroupId ?? "",
      month: plan.month,
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

async function resolveTopicRewardStudents(
  topic: { crmStudentId: string | null; crmGroupId: string | null },
  crmClassId: string,
) {
  const crmStudentIds = topic.crmStudentId
    ? [topic.crmStudentId]
    : topic.crmGroupId
      ? ((await fetchClassStudents(crmClassId)) as {
          students?: Array<{ crmStudentId: string; groupStatus?: string }>;
        }).students
          ?.filter((student) => !["inactive", "archived", "left"].includes(student.groupStatus ?? "active"))
          .map((student) => student.crmStudentId) ?? []
      : [];

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
}) {
  if (!rewardEconomyV2AppliesToEvent(params.occurredAt)) return;

  const students = await resolveTopicRewardStudents(params.topic, params.crmClassId);
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
    const activeTopics = publishedVersion?.topics.filter((link) => link.state === LearningPlanTopicState.active) ?? [];
    if (!activeTopics.length || activeTopics.some((link) => link.topic.progressPercent !== 100)) continue;

    const completionSourceKey = `learning-plan-completion:${plan.id}`;
    if (plan.completionRewardSourceKey?.includes("blocked-before-cutover")) continue;
    if (plan.completionRewardSourceKey && plan.completionRewardSourceKey !== completionSourceKey) continue;

    if (!plan.completionRewardSourceKey) {
      await prisma.learningPlan.updateMany({
        where: { id: plan.id, completionRewardSourceKey: null },
        data: {
          completionRewardSourceKey: completionSourceKey,
          completedAt: params.occurredAt,
          lockedAt: params.occurredAt,
        },
      });
    }

    for (const student of students) {
      await awardSystemPoints({
        studentId: student.id,
        amount: NON_EMPTY_PLAN_COMPLETION_POINTS,
        reason: `Завершён план на ${plan.month}`,
        sourceKey: `${completionSourceKey}:${student.id}`,
        eventAt: params.occurredAt,
      });
    }
  }
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
  },
) {
  if (!Number.isInteger(input.toPercent) || input.toPercent < 0 || input.toPercent > 100) {
    throw new BadRequestError(
      "Процент темы должен быть целым числом от 0 до 100",
      "LEARNING_TOPIC_PROGRESS_INVALID",
    );
  }
  const scoped = await requireLessonTopicScope(actorUserId, topicId);
  const sourceKey = `offline-lesson:${input.crmClassId}:topic:${topicId}`;
  const existingEvent = await prisma.learningTopicProgress.findUnique({
    where: { sourceKey },
  });
  if (existingEvent) {
    if (existingEvent.topicId !== topicId || existingEvent.toPercent !== input.toPercent) {
      throw new ConflictError(
        "Прогресс этой темы уже зафиксирован в итогах урока",
        "LESSON_TOPIC_PROGRESS_ALREADY_RECORDED",
      );
    }
    if (existingEvent.toPercent === 100) {
      await applyTopicMasteryRewards({
        topic: scoped,
        crmClassId: input.crmClassId,
        occurredAt: existingEvent.occurredAt,
      });
    }
    return { ...topicDto(scoped), idempotent: true };
  }
  if (scoped.progressPercent === 100) {
    throw new ConflictError(
      "Освоенная тема заблокирована. Исправление выполняется куратором отдельным действием.",
      "LEARNING_TOPIC_MASTERED_LOCKED",
    );
  }
  if (scoped.progressPercent !== input.expectedPercent) {
    throw new ConflictError(
      "Процент темы изменился. Обновите урок и повторите действие.",
      "LEARNING_TOPIC_STALE_PROGRESS",
    );
  }
  if (scoped.progressPercent === input.toPercent) {
    return { ...topicDto(scoped), idempotent: true };
  }
  const occurredAt = input.occurredAt ?? new Date();
  let masteryStudents: Array<{ id: string }> = [];
  if (input.toPercent === 100 && rewardEconomyV2AppliesToEvent(occurredAt)) {
    masteryStudents = await resolveTopicRewardStudents(scoped, input.crmClassId);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.learningTopic.updateMany({
      where: {
        id: topicId,
        progressPercent: input.expectedPercent,
        archivedAt: null,
      },
      data: {
        progressPercent: input.toPercent,
        ...(input.toPercent === 100
          ? {
              masteredAt: occurredAt,
              masteryRewardSourceKey: masteryStudents.length
                ? `learning-topic-mastery:${topicId}`
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
        topicId,
        fromPercent: input.expectedPercent,
        toPercent: input.toPercent,
        source: LearningTopicProgressSource.lesson,
        sourceKey,
        comment: input.comment?.trim() || null,
        changedById: actorUserId,
        occurredAt,
      },
    });
  });

  if (input.toPercent === 100) {
    await applyTopicMasteryRewards({
      topic: scoped,
      crmClassId: input.crmClassId,
      occurredAt,
    });
  }

  return {
    ...topicDto(await requireLessonTopicScope(actorUserId, topicId)),
    idempotent: false,
  };
}
