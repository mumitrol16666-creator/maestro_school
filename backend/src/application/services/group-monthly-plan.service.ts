import { Prisma } from "@prisma/client";
import {
  buildMonthlyPlanSnapshot,
  calculateMonthlyPlanProgress,
  normalizeMonthlyPlanItems,
  parseMonthlyPlanSnapshot,
} from "../../domain/monthly-plan.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchTeacherGroups } from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import type { MonthlyPlanInput } from "./student-monthly-plan.service.js";

export type GroupPlanMaterial = {
  id: string;
  title: string;
  url: string;
  note: string;
};

export type GroupMonthlyPlanInput = MonthlyPlanInput & {
  materials: GroupPlanMaterial[];
};

type GroupMonthlyPlanRecord = {
  id: string;
  month: string;
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: Prisma.JsonValue;
  materials: Prisma.JsonValue;
  publishedSnapshot: Prisma.JsonValue | null;
  publishedAt: Date | null;
  draftRevision: number;
  publishedRevision: number;
  updatedAt: Date;
};

function planDto(plan: GroupMonthlyPlanRecord) {
  const items = normalizeMonthlyPlanItems(plan.items);
  return {
    id: plan.id,
    month: plan.month,
    goal: plan.goal,
    expectedResult: plan.expectedResult,
    skills: plan.skills,
    checkpoint: plan.checkpoint,
    note: plan.note,
    items,
    materials: Array.isArray(plan.materials) ? plan.materials as GroupPlanMaterial[] : [],
    progress: calculateMonthlyPlanProgress(items),
    updatedAt: plan.updatedAt,
    publication: {
      isPublished: Boolean(plan.publishedAt && plan.publishedSnapshot),
      publishedAt: plan.publishedAt,
      draftRevision: plan.draftRevision,
      publishedRevision: plan.publishedRevision,
      hasUnpublishedChanges: plan.draftRevision > plan.publishedRevision,
    },
  };
}

async function requireAssignedGroup(teacherUserId: string, crmGroupId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherGroups(crmTeacherId);
  const group = roster.groups.find((item) => item.crmGroupId === crmGroupId);
  if (!group) {
    throw new BadRequestError(
      "Эта группа не назначена преподавателю",
      "GROUP_NOT_ASSIGNED",
    );
  }
  return group;
}

export async function getGroupMonthlyPlan(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
) {
  const group = await requireAssignedGroup(teacherUserId, crmGroupId);
  const plan = await prisma.groupMonthlyPlan.findUnique({
    where: {
      crmGroupId_teacherUserId_month: { crmGroupId, teacherUserId, month },
    },
  });

  return {
    group: {
      crmGroupId,
      name: group.name,
    },
    month,
    plan: plan ? planDto(plan) : null,
  };
}

export async function saveGroupMonthlyPlan(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  input: GroupMonthlyPlanInput,
) {
  await requireAssignedGroup(teacherUserId, crmGroupId);
  const items = normalizeMonthlyPlanItems(input.items);
  const materials = input.materials.map((material) => ({
    id: material.id,
    title: material.title.trim(),
    url: material.url.trim(),
    note: material.note.trim(),
  })).filter((material) => material.title || material.url || material.note);
  const normalized = {
    goal: input.goal.trim(),
    expectedResult: input.expectedResult.trim(),
    skills: input.skills.trim(),
    checkpoint: input.checkpoint.trim(),
    note: input.note.trim(),
    items,
    materials,
  };

  const where = { crmGroupId_teacherUserId_month: { crmGroupId, teacherUserId, month } };
  const existing = await prisma.groupMonthlyPlan.findUnique({ where });
  const unchanged = existing
    && existing.goal === normalized.goal
    && existing.expectedResult === normalized.expectedResult
    && existing.skills === normalized.skills
    && existing.checkpoint === normalized.checkpoint
    && existing.note === normalized.note
    && JSON.stringify(normalizeMonthlyPlanItems(existing.items)) === JSON.stringify(items)
    && JSON.stringify(existing.materials) === JSON.stringify(materials);
  if (unchanged) return { ...planDto(existing), idempotent: true };

  const data = {
    ...normalized,
    items: items as Prisma.InputJsonValue,
    materials: materials as Prisma.InputJsonValue,
  };

  const plan = await prisma.groupMonthlyPlan.upsert({
    where,
    create: {
      crmGroupId,
      teacherUserId,
      month,
      ...data,
    },
    update: { ...data, draftRevision: { increment: 1 } },
  });
  return { ...planDto(plan), idempotent: false };
}

export async function publishGroupMonthlyPlan(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  expectedDraftRevision?: number,
) {
  await requireAssignedGroup(teacherUserId, crmGroupId);
  const where = { crmGroupId_teacherUserId_month: { crmGroupId, teacherUserId, month } };
  const plan = await prisma.groupMonthlyPlan.findUnique({ where });
  if (!plan) throw new BadRequestError("План группы не найден", "MONTHLY_PLAN_NOT_FOUND");
  if (expectedDraftRevision != null && plan.draftRevision !== expectedDraftRevision) {
    throw new ConflictError("План изменился. Обновите страницу и повторите публикацию.", "MONTHLY_PLAN_STALE_DRAFT");
  }
  const snapshot = buildMonthlyPlanSnapshot(plan);
  if (!snapshot.goal) throw new BadRequestError("Заполните фокус месяца", "MONTHLY_PLAN_GOAL_REQUIRED");
  if (!snapshot.items.length) throw new BadRequestError("Добавьте хотя бы одну тему", "MONTHLY_PLAN_ITEMS_REQUIRED");
  if (plan.publishedRevision === plan.draftRevision && plan.publishedSnapshot) {
    return { ...planDto(plan), idempotent: true, publicationEvent: null };
  }
  const wasPublished = Boolean(plan.publishedAt && plan.publishedSnapshot);
  const updated = await prisma.groupMonthlyPlan.update({
    where,
    data: {
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      publishedAt: new Date(),
      publishedRevision: plan.draftRevision,
    },
  });
  return {
    ...planDto(updated),
    idempotent: false,
    publicationEvent: wasPublished ? "monthly_plan_republished" : "monthly_plan_published",
  };
}

export async function listPublishedGroupMonthlyPlans(crmGroupIds: string[], month: string) {
  if (!crmGroupIds.length) return [];
  const plans = await prisma.groupMonthlyPlan.findMany({
    where: {
      crmGroupId: { in: crmGroupIds },
      month,
      publishedAt: { not: null },
      publishedSnapshot: { not: Prisma.DbNull },
    },
    include: { teacherUser: { select: { firstName: true, lastName: true, middleName: true } } },
    orderBy: { publishedAt: "desc" },
  });
  return plans.flatMap((plan) => {
    const snapshot = parseMonthlyPlanSnapshot(plan.publishedSnapshot);
    if (!snapshot) {
      console.warn("[monthly-plan] skipped invalid group snapshot", { planId: plan.id, month });
      return [];
    }
    return [{
      id: plan.id,
      scope: "group" as const,
      targetId: plan.crmGroupId,
      month: plan.month,
      teacher: {
        name: [plan.teacherUser.lastName, plan.teacherUser.firstName, plan.teacherUser.middleName]
          .filter(Boolean).join(" "),
      },
      ...snapshot,
      publishedAt: plan.publishedAt,
    }];
  });
}
