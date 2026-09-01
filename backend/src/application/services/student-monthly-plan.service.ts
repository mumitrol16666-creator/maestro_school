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

type StudentMonthlyPlanRecord = {
  id: string;
  month: string;
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: Prisma.JsonValue;
  publishedSnapshot: Prisma.JsonValue | null;
  publishedAt: Date | null;
  draftRevision: number;
  publishedRevision: number;
  updatedAt: Date;
};

function planDto(plan: StudentMonthlyPlanRecord) {
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

  if (unchanged) return { ...planDto(existing), idempotent: true };

  const data = {
    ...normalized,
    items: normalized.items as Prisma.InputJsonValue,
  };
  const plan = await prisma.studentMonthlyPlan.upsert({
    where,
    create: { crmStudentId, teacherUserId, month, ...data },
    update: { ...data, draftRevision: { increment: 1 } },
  });
  return { ...planDto(plan), idempotent: false };
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
  if (plan.publishedRevision === plan.draftRevision && plan.publishedSnapshot) {
    return { ...planDto(plan), idempotent: true, publicationEvent: null };
  }

  const wasPublished = Boolean(plan.publishedAt && plan.publishedSnapshot);
  const publishedAt = new Date();
  const updated = await prisma.studentMonthlyPlan.update({
    where,
    data: {
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      publishedAt,
      publishedRevision: plan.draftRevision,
    },
  });

  try {
    const studentUser = await prisma.user.findFirst({
      where: { crmStudentId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (studentUser) {
      const { deliverUserNotification } = await import("./notification.service.js");
      await deliverUserNotification({
        userId: studentUser.id,
        type: "offline_lesson_report_ready",
        title: `Учебный план на ${month} готов!`,
        body: `Цель месяца: «${snapshot.goal}». Посмотри список тем и песен на главной.`,
        url: "/monthly-plan",
        tag: `monthly-plan-${month}`,
        dedupeKey: `legacy-monthly-plan:${plan.id}:revision:${plan.draftRevision}`,
      });
    }
  } catch {
    // Non-blocking notification delivery
  }

  return {
    ...planDto(updated),
    idempotent: false,
    publicationEvent: wasPublished ? "monthly_plan_republished" : "monthly_plan_published",
  };
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
    if (!snapshot) {
      console.warn("[monthly-plan] skipped invalid student snapshot", { planId: plan.id, month });
      return [];
    }
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
