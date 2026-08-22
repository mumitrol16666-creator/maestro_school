import { Prisma } from "@prisma/client";
import {
  buildMonthlyPlanSnapshot,
  calculateMonthlyPlanProgress,
  normalizeMonthlyPlanItems,
  parseMonthlyPlanSnapshot,
  type MonthlyPlanItem,
} from "../../domain/monthly-plan.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { listTeacherStudents } from "./teacher-students.service.js";

export type { MonthlyPlanItem } from "../../domain/monthly-plan.js";

export type MonthlyPlanInput = {
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: MonthlyPlanItem[];
};

async function requireAssignedStudent(teacherUserId: string, crmStudentId: string) {
  const roster = await listTeacherStudents(teacherUserId);
  const student = roster.students.find((item) => item.crmStudentId === crmStudentId);
  if (!student) {
    throw new BadRequestError(
      "Этот ученик не назначен преподавателю",
      "STUDENT_NOT_ASSIGNED",
    );
  }
  return student;
}

function normalizedPlanInput(input: MonthlyPlanInput) {
  return {
    goal: input.goal.trim(),
    expectedResult: input.expectedResult.trim(),
    skills: input.skills.trim(),
    checkpoint: input.checkpoint.trim(),
    note: input.note.trim(),
    items: normalizeMonthlyPlanItems(input.items),
  };
}

function planDto<T extends {
  items: Prisma.JsonValue;
  publishedSnapshot: Prisma.JsonValue | null;
  publishedAt: Date | null;
  draftRevision: number;
  publishedRevision: number;
}>(plan: T) {
  const items = normalizeMonthlyPlanItems(plan.items);
  return {
    ...plan,
    items,
    progress: calculateMonthlyPlanProgress(items),
    publication: {
      isPublished: Boolean(plan.publishedAt && plan.publishedSnapshot),
      publishedAt: plan.publishedAt,
      draftRevision: plan.draftRevision,
      publishedRevision: plan.publishedRevision,
      hasUnpublishedChanges: plan.draftRevision > plan.publishedRevision,
    },
  };
}

export async function getStudentMonthlyPlan(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
) {
  const student = await requireAssignedStudent(teacherUserId, crmStudentId);
  const plan = await prisma.studentMonthlyPlan.findUnique({
    where: {
      crmStudentId_teacherUserId_month: { crmStudentId, teacherUserId, month },
    },
  });

  return {
    student: { crmStudentId, name: student.name },
    month,
    plan: plan ? planDto(plan) : null,
  };
}

export async function saveStudentMonthlyPlan(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  input: MonthlyPlanInput,
) {
  await requireAssignedStudent(teacherUserId, crmStudentId);
  const normalized = normalizedPlanInput(input);
  const where = { crmStudentId_teacherUserId_month: { crmStudentId, teacherUserId, month } };
  const existing = await prisma.studentMonthlyPlan.findUnique({ where });
  const unchanged = existing
    && existing.goal === normalized.goal
    && existing.expectedResult === normalized.expectedResult
    && existing.skills === normalized.skills
    && existing.checkpoint === normalized.checkpoint
    && existing.note === normalized.note
    && JSON.stringify(normalizeMonthlyPlanItems(existing.items)) === JSON.stringify(normalized.items);

  if (unchanged) return planDto(existing);

  const data = {
    ...normalized,
    items: normalized.items as Prisma.InputJsonValue,
  };
  const plan = await prisma.studentMonthlyPlan.upsert({
    where,
    create: { crmStudentId, teacherUserId, month, ...data },
    update: { ...data, draftRevision: { increment: 1 } },
  });
  return planDto(plan);
}

export async function publishStudentMonthlyPlan(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  expectedDraftRevision?: number,
) {
  await requireAssignedStudent(teacherUserId, crmStudentId);
  const where = { crmStudentId_teacherUserId_month: { crmStudentId, teacherUserId, month } };
  const plan = await prisma.studentMonthlyPlan.findUnique({ where });
  if (!plan) throw new BadRequestError("План месяца не найден", "MONTHLY_PLAN_NOT_FOUND");
  if (expectedDraftRevision != null && plan.draftRevision !== expectedDraftRevision) {
    throw new ConflictError("План изменился. Обновите страницу и повторите публикацию.", "MONTHLY_PLAN_STALE_DRAFT");
  }
  const snapshot = buildMonthlyPlanSnapshot(plan);
  if (!snapshot.goal) throw new BadRequestError("Заполните фокус месяца", "MONTHLY_PLAN_GOAL_REQUIRED");
  if (!snapshot.items.length) throw new BadRequestError("Добавьте хотя бы одну тему", "MONTHLY_PLAN_ITEMS_REQUIRED");
  if (plan.publishedRevision === plan.draftRevision && plan.publishedSnapshot) return planDto(plan);

  const publishedAt = new Date();
  const updated = await prisma.studentMonthlyPlan.update({
    where,
    data: {
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      publishedAt,
      publishedRevision: plan.draftRevision,
    },
  });
  return planDto(updated);
}

export async function listPublishedStudentMonthlyPlans(crmStudentId: string, month: string) {
  const plans = await prisma.studentMonthlyPlan.findMany({
    where: {
      crmStudentId,
      month,
      publishedAt: { not: null },
      publishedSnapshot: { not: Prisma.DbNull },
    },
    include: {
      teacherUser: { select: { firstName: true, lastName: true, middleName: true } },
    },
    orderBy: { publishedAt: "desc" },
  });

  return plans.flatMap((plan) => {
    const snapshot = parseMonthlyPlanSnapshot(plan.publishedSnapshot);
    if (!snapshot) return [];
    return [{
      id: plan.id,
      scope: "student" as const,
      targetId: plan.crmStudentId,
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
