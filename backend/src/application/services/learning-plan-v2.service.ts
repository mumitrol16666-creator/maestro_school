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

export type LearningPlanCarryoverInput = {
  topicIds: string[];
  expectedTargetVersion?: number;
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

export function previousLearningPlanMonth(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) {
    throw new BadRequestError("Некорректный месяц учебного плана", "MONTHLY_PLAN_MONTH_INVALID");
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const previousYear = monthNumber === 1 ? year - 1 : year;
  const previousMonth = monthNumber === 1 ? 12 : monthNumber - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
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

function carryoverCandidateDto(
  sourceMonth: string,
  link: PlanWithVersions["versions"][number]["topics"][number],
) {
  return {
    topicId: link.topic.id,
    sourceMonth,
    title: link.titleSnapshot,
    masteryCriteria: link.masteryCriteriaSnapshot,
    progressPercent: link.topic.progressPercent ?? 0,
    status: learningTopicStatus(link.topic.progressPercent),
  };
}

async function getCarryoverPreview(scope: ResolvedScope, targetMonth: string) {
  const sourceMonth = previousLearningPlanMonth(targetMonth);
  const [sourcePlan, targetPlan] = await Promise.all([
    findPlan(scope, sourceMonth),
    findPlan(scope, targetMonth),
  ]);
  const sourceVersion = sourcePlan?.publishedVersionNumber
    ? sourcePlan.versions.find((version) => version.version === sourcePlan.publishedVersionNumber)
    : null;
  const targetVersion = targetPlan?.versions.find(
    (version) => version.version === targetPlan.currentVersionNumber,
  );
  const targetTopicIds = new Set(targetVersion?.topics.map((link) => link.topicId) ?? []);
  const sourceIncompleteLinks = (sourceVersion?.topics ?? [])
    .filter((link) => (
      !link.topic.archivedAt
      && (link.topic.progressPercent ?? 0) < 100
    ));
  const candidates = sourceIncompleteLinks
    .filter((link) => link.state === LearningPlanTopicState.active)
    .filter((link) => !targetTopicIds.has(link.topicId))
    .map((link) => carryoverCandidateDto(sourceMonth, link));
  const continuedTopics = sourceIncompleteLinks
    .filter((link) => targetTopicIds.has(link.topicId))
    .map((link) => carryoverCandidateDto(sourceMonth, link));

  return {
    sourceMonth,
    targetMonth,
    sourcePlanId: sourcePlan?.id ?? null,
    sourceHasUnpublishedChanges: Boolean(
      sourcePlan
      && sourcePlan.currentVersionNumber !== sourcePlan.publishedVersionNumber,
    ),
    targetPlanId: targetPlan?.id ?? null,
    targetVersion: targetPlan?.currentVersionNumber ?? 0,
    candidates,
    continuedTopics,
  };
}

async function carryOverTopics(
  teacherUserId: string,
  scope: ResolvedScope,
  targetMonth: string,
  input: LearningPlanCarryoverInput,
) {
  const topicIds = [...new Set(input.topicIds.map((topicId) => topicId.trim()))];
  if (!topicIds.length) {
    throw new BadRequestError(
      "Выберите хотя бы одну незавершённую тему",
      "MONTHLY_PLAN_CARRYOVER_TOPICS_REQUIRED",
    );
  }
  if (topicIds.some((topicId) => !UUID_PATTERN.test(topicId))) {
    throw new BadRequestError(
      "Некорректный идентификатор темы",
      "MONTHLY_PLAN_CARRYOVER_TOPIC_INVALID",
    );
  }

  const sourceMonth = previousLearningPlanMonth(targetMonth);
  let result: { planId: string; addedTopicIds: string[]; idempotent: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const sourcePlan = await tx.learningPlan.findFirst({
        where: {
          directionId: scope.direction.id,
          month: sourceMonth,
          publishedVersionNumber: { not: null },
          ...ownerWhere(scope.owner),
        },
        include: planInclude,
      });
      if (!sourcePlan?.publishedVersionNumber) {
        throw new BadRequestError(
          `Опубликованный план за ${sourceMonth} не найден`,
          "MONTHLY_PLAN_CARRYOVER_SOURCE_NOT_FOUND",
        );
      }
      if (sourcePlan.currentVersionNumber !== sourcePlan.publishedVersionNumber) {
        throw new ConflictError(
          `В плане за ${sourceMonth} есть неопубликованные изменения. Опубликуйте или отмените их перед переносом.`,
          "MONTHLY_PLAN_SOURCE_HAS_UNPUBLISHED_CHANGES",
        );
      }
      const sourceVersion = sourcePlan.versions.find(
        (version) => version.version === sourcePlan.publishedVersionNumber,
      );
      if (!sourceVersion) {
        throw new ConflictError(
          "Опубликованная версия прошлого плана не найдена",
          "MONTHLY_PLAN_VERSION_MISSING",
        );
      }

      let targetPlan = await tx.learningPlan.findFirst({
        where: {
          directionId: scope.direction.id,
          month: targetMonth,
          ...ownerWhere(scope.owner),
        },
        include: planInclude,
      });
      const currentTargetVersion = targetPlan?.versions.find(
        (version) => version.version === targetPlan?.currentVersionNumber,
      ) ?? null;
      assertExpectedLearningPlanVersion(
        targetPlan?.currentVersionNumber ?? 0,
        input.expectedTargetVersion,
      );
      if (targetPlan?.lockedAt) {
        throw new ConflictError(
          "Завершённый план заблокирован для изменения состава",
          "MONTHLY_PLAN_LOCKED",
        );
      }

      const existingTopicIds = new Set(
        currentTargetVersion?.topics.map((link) => link.topicId) ?? [],
      );
      const sourceLinks = new Map(
        sourceVersion.topics
          .filter((link) => (
            link.state === LearningPlanTopicState.active
            && !link.topic.archivedAt
            && (link.topic.progressPercent ?? 0) < 100
          ))
          .map((link) => [link.topicId, link]),
      );
      const invalidTopicIds = topicIds.filter(
        (topicId) => !existingTopicIds.has(topicId) && !sourceLinks.has(topicId),
      );
      if (invalidTopicIds.length) {
        throw new BadRequestError(
          "Одна из выбранных тем уже завершена или отсутствует в прошлом плане",
          "MONTHLY_PLAN_CARRYOVER_TOPIC_UNAVAILABLE",
        );
      }
      const addedTopicIds = topicIds.filter((topicId) => !existingTopicIds.has(topicId));
      if (!addedTopicIds.length && targetPlan) {
        return { planId: targetPlan.id, addedTopicIds: [], idempotent: true };
      }

      if (!targetPlan) {
        targetPlan = await tx.learningPlan.create({
          data: {
            id: randomUUID(),
            directionId: scope.direction.id,
            month: targetMonth,
            createdById: teacherUserId,
            ...ownerWhere(scope.owner),
          },
          include: planInclude,
        });
      }

      const carriedTopics = addedTopicIds.map((topicId, sortOrder) => {
        const link = sourceLinks.get(topicId)!;
        return {
          topicId,
          titleSnapshot: link.titleSnapshot,
          masteryCriteriaSnapshot: link.masteryCriteriaSnapshot,
          state: LearningPlanTopicState.active,
          sortOrder,
        };
      });
      const existingTopics = (currentTargetVersion?.topics ?? []).map((link, index) => ({
        topicId: link.topicId,
        titleSnapshot: link.titleSnapshot,
        masteryCriteriaSnapshot: link.masteryCriteriaSnapshot,
        state: link.state,
        replacementTopicId: link.replacementTopicId,
        sortOrder: carriedTopics.length + index,
      }));
      const nextVersion = targetPlan.currentVersionNumber + 1;
      await tx.learningPlanVersion.create({
        data: {
          planId: targetPlan.id,
          version: nextVersion,
          goal: currentTargetVersion?.goal ?? "",
          expectedResult: currentTargetVersion?.expectedResult ?? "",
          skills: currentTargetVersion?.skills ?? "",
          checkpoint: currentTargetVersion?.checkpoint ?? "",
          note: currentTargetVersion?.note ?? "",
          materials: (currentTargetVersion?.materials ?? []) as Prisma.InputJsonValue,
          createdById: teacherUserId,
          sourceRevision: sourceVersion.version,
          topics: { create: [...carriedTopics, ...existingTopics] },
        },
      });
      const updated = await tx.learningPlan.updateMany({
        where: {
          id: targetPlan.id,
          currentVersionNumber: targetPlan.currentVersionNumber,
          lockedAt: null,
        },
        data: { currentVersionNumber: nextVersion },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "План изменился. Обновите страницу и повторите перенос.",
          "MONTHLY_PLAN_STALE_DRAFT",
        );
      }
      return { planId: targetPlan.id, addedTopicIds, idempotent: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "План изменился во время переноса. Обновите страницу и повторите действие.",
        "MONTHLY_PLAN_STALE_DRAFT",
      );
    }
    throw error;
  }

  return {
    sourceMonth,
    targetMonth,
    addedTopicIds: result.addedTopicIds,
    idempotent: result.idempotent,
    plan: versionDto(await loadPlan(result.planId)),
  };
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
        "План на это направление и месяц уже создан. Обновите страницу.",
        "MONTHLY_PLAN_ALREADY_EXISTS",
      );
    }
    throw error;
  }

  return { ...versionDto(await loadPlan(result.planId)), idempotent: result.idempotent };
}

async function markPublishedTopicsTransferredFromPreviousMonth(
  tx: Prisma.TransactionClient,
  teacherUserId: string,
  scope: ResolvedScope,
  targetMonth: string,
  targetTopicIds: Set<string>,
  publishedAt: Date,
) {
  if (!targetTopicIds.size) return [];
  const sourceMonth = previousLearningPlanMonth(targetMonth);
  const sourcePlan = await tx.learningPlan.findFirst({
    where: {
      directionId: scope.direction.id,
      month: sourceMonth,
      publishedVersionNumber: { not: null },
      ...ownerWhere(scope.owner),
    },
    include: planInclude,
  });
  if (!sourcePlan?.publishedVersionNumber) return [];
  const sourceVersion = sourcePlan.versions.find(
    (version) => version.version === sourcePlan.publishedVersionNumber,
  );
  if (!sourceVersion) {
    throw new ConflictError(
      "Опубликованная версия прошлого плана не найдена",
      "MONTHLY_PLAN_VERSION_MISSING",
    );
  }
  const transferredTopicIds = sourceVersion.topics
    .filter((link) => (
      link.state === LearningPlanTopicState.active
      && targetTopicIds.has(link.topicId)
      && (link.topic.progressPercent ?? 0) < 100
    ))
    .map((link) => link.topicId);
  if (!transferredTopicIds.length) return [];
  if (sourcePlan.currentVersionNumber !== sourcePlan.publishedVersionNumber) {
    throw new ConflictError(
      `В плане за ${sourceMonth} есть неопубликованные изменения. Опубликуйте или отмените их перед переносом.`,
      "MONTHLY_PLAN_SOURCE_HAS_UNPUBLISHED_CHANGES",
    );
  }
  if (sourcePlan.lockedAt) {
    throw new ConflictError(
      `План за ${sourceMonth} уже завершён и заблокирован`,
      "MONTHLY_PLAN_CARRYOVER_SOURCE_LOCKED",
    );
  }

  const transferredSet = new Set(transferredTopicIds);
  const nextVersion = sourcePlan.currentVersionNumber + 1;
  await tx.learningPlanVersion.create({
    data: {
      planId: sourcePlan.id,
      version: nextVersion,
      goal: sourceVersion.goal,
      expectedResult: sourceVersion.expectedResult,
      skills: sourceVersion.skills,
      checkpoint: sourceVersion.checkpoint,
      note: sourceVersion.note,
      materials: sourceVersion.materials as Prisma.InputJsonValue,
      createdById: teacherUserId,
      sourceRevision: sourceVersion.version,
      publishedAt,
      topics: {
        create: sourceVersion.topics.map((link) => ({
          topicId: link.topicId,
          titleSnapshot: link.titleSnapshot,
          masteryCriteriaSnapshot: link.masteryCriteriaSnapshot,
          state: transferredSet.has(link.topicId)
            ? LearningPlanTopicState.transferred
            : link.state,
          replacementTopicId: link.replacementTopicId,
          sortOrder: link.sortOrder,
        })),
      },
    },
  });
  const updated = await tx.learningPlan.updateMany({
    where: {
      id: sourcePlan.id,
      currentVersionNumber: sourcePlan.currentVersionNumber,
      publishedVersionNumber: sourcePlan.publishedVersionNumber,
      lockedAt: null,
    },
    data: {
      currentVersionNumber: nextVersion,
      publishedVersionNumber: nextVersion,
    },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      `План за ${sourceMonth} изменился. Обновите страницу и повторите публикацию.`,
      "MONTHLY_PLAN_STALE_DRAFT",
    );
  }
  return transferredTopicIds;
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
  const currentTopicIds = new Set(
    currentVersion.topics
      .filter((link) => link.state === LearningPlanTopicState.active)
      .map((link) => link.topicId),
  );
  await prisma.$transaction(async (tx) => {
    await markPublishedTopicsTransferredFromPreviousMonth(
      tx,
      teacherUserId,
      scope,
      month,
      currentTopicIds,
      publishedAt,
    );
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

export async function getStudentLearningPlanCarryoverV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  targetMonth: string,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return getCarryoverPreview(scope, targetMonth);
}

export async function carryOverStudentLearningPlanTopicsV2(
  teacherUserId: string,
  crmStudentId: string,
  crmDirectionId: string,
  targetMonth: string,
  input: LearningPlanCarryoverInput,
) {
  const scope = await resolveStudentScope(teacherUserId, crmStudentId, crmDirectionId);
  return carryOverTopics(teacherUserId, scope, targetMonth, input);
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

export async function getGroupLearningPlanCarryoverV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  targetMonth: string,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return getCarryoverPreview(scope, targetMonth);
}

export async function carryOverGroupLearningPlanTopicsV2(
  teacherUserId: string,
  crmGroupId: string,
  crmDirectionId: string,
  targetMonth: string,
  input: LearningPlanCarryoverInput,
) {
  const scope = await resolveGroupScope(teacherUserId, crmGroupId, crmDirectionId);
  return carryOverTopics(teacherUserId, scope, targetMonth, input);
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
  const previousMonth = previousLearningPlanMonth(month);
  const ownerScope = [
    { crmStudentId, crmGroupId: null },
    ...(crmGroupIds.length ? [{ crmStudentId: null, crmGroupId: { in: [...crmGroupIds] } }] : []),
  ];
  const [plans, previousPlans] = await Promise.all([
    prisma.learningPlan.findMany({
      where: {
        month,
        publishedVersionNumber: { not: null },
        OR: ownerScope,
      },
      include: planInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    prisma.learningPlan.findMany({
      where: {
        month: previousMonth,
        publishedVersionNumber: { not: null },
        OR: ownerScope,
      },
      include: planInclude,
    }),
  ]);
  const previousTopicKeys = new Set(previousPlans.flatMap((plan) => {
    if (!plan.publishedVersionNumber) return [];
    const version = plan.versions.find((item) => item.version === plan.publishedVersionNumber);
    return (version?.topics ?? [])
      .filter((link) => link.state === LearningPlanTopicState.transferred)
      .map((link) => `${plan.directionId}:${link.topicId}`);
  }));

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
      items: dto.items.map((item) => ({
        ...item,
        continuedFromMonth: item.state === LearningPlanTopicState.active
          && previousTopicKeys.has(`${plan.directionId}:${item.id}`)
          ? previousMonth
          : null,
      })),
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

export function topicRewardCrmStudentIds(
  topic: { crmStudentId: string | null; crmGroupId: string | null },
  currentGroupCrmStudentIds: readonly string[],
  immutableRecipientCrmStudentIds?: readonly string[],
) {
  const candidates = immutableRecipientCrmStudentIds ?? (
    topic.crmStudentId ? [topic.crmStudentId] : currentGroupCrmStudentIds
  );
  const uniqueCandidates = [...new Set(candidates.map((id) => id.trim()).filter(Boolean))];
  if (topic.crmStudentId) {
    return uniqueCandidates.includes(topic.crmStudentId) ? [topic.crmStudentId] : [];
  }
  return topic.crmGroupId ? uniqueCandidates : [];
}

async function resolveTopicRewardStudents(
  topic: { crmStudentId: string | null; crmGroupId: string | null },
  crmClassId: string,
  immutableRecipientCrmStudentIds?: readonly string[],
) {
  const currentGroupCrmStudentIds = topic.crmGroupId && immutableRecipientCrmStudentIds === undefined
    ? ((await fetchClassStudents(crmClassId)) as {
        students?: Array<{ crmStudentId: string; groupStatus?: string }>;
      }).students
        ?.filter((student) => !["inactive", "archived", "left"].includes(student.groupStatus ?? "active"))
        .map((student) => student.crmStudentId) ?? []
    : [];
  const crmStudentIds = topicRewardCrmStudentIds(
    topic,
    currentGroupCrmStudentIds,
    immutableRecipientCrmStudentIds,
  );

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
