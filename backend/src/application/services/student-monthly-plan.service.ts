import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { listTeacherStudents } from "./teacher-students.service.js";

export type MonthlyPlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

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
    student: {
      crmStudentId,
      name: student.name,
    },
    month,
    plan: plan
      ? {
          ...plan,
          items: plan.items as MonthlyPlanItem[],
        }
      : null,
  };
}

export async function saveStudentMonthlyPlan(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  input: MonthlyPlanInput,
) {
  await requireAssignedStudent(teacherUserId, crmStudentId);
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
  };

  return prisma.studentMonthlyPlan.upsert({
    where: {
      crmStudentId_teacherUserId_month: { crmStudentId, teacherUserId, month },
    },
    create: {
      crmStudentId,
      teacherUserId,
      month,
      ...data,
    },
    update: data,
  });
}
