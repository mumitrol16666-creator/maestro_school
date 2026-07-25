import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchTeacherGroups } from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import type { MonthlyPlanInput, MonthlyPlanItem } from "./student-monthly-plan.service.js";

export type GroupPlanMaterial = {
  id: string;
  title: string;
  url: string;
  note: string;
};

export type GroupMonthlyPlanInput = MonthlyPlanInput & {
  materials: GroupPlanMaterial[];
};

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
    plan: plan
      ? {
          ...plan,
          items: plan.items as MonthlyPlanItem[],
          materials: plan.materials as GroupPlanMaterial[],
        }
      : null,
  };
}

export async function saveGroupMonthlyPlan(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  input: GroupMonthlyPlanInput,
) {
  await requireAssignedGroup(teacherUserId, crmGroupId);
  const data = {
    goal: input.goal.trim(),
    expectedResult: input.expectedResult.trim(),
    skills: input.skills.trim(),
    checkpoint: input.checkpoint.trim(),
    note: input.note.trim(),
    items: input.items.map((item) => ({
      id: item.id,
      title: item.title.trim(),
      status: item.status,
    })).filter((item) => item.title) as Prisma.InputJsonValue,
    materials: input.materials.map((material) => ({
      id: material.id,
      title: material.title.trim(),
      url: material.url.trim(),
      note: material.note.trim(),
    })).filter((material) => material.title || material.url || material.note) as Prisma.InputJsonValue,
  };

  return prisma.groupMonthlyPlan.upsert({
    where: {
      crmGroupId_teacherUserId_month: { crmGroupId, teacherUserId, month },
    },
    create: {
      crmGroupId,
      teacherUserId,
      month,
      ...data,
    },
    update: data,
  });
}
