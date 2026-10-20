import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { NON_EMPTY_PLAN_COMPLETION_POINTS } from "../../domain/product-economy-v2.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { fetchTeacherGroupsForAccess } from "./teacher-substitution.service.js";
import { awardSystemPoints } from "./points.service.js";

/**
 * Plan 1.13: a group's sector. On the group's lessons only its topics move (one percent for the
 * group). The sector closes when its teacher says the group moves on; the 250 Points of a closed
 * sector go to each member who passed it: by their own exam or counted by the teacher without one.
 * A member who did not pass keeps their exam open (a retake) after the group has moved on.
 */

const OPEN_EXAM_STATUSES = ["draft", "awaiting_schedule", "scheduled", "in_progress"] as const;

export type GroupMember = { crmStudentId: string; name: string };

export async function requireTeacherGroup(teacherUserId: string, crmGroupId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherGroupsForAccess(crmTeacherId, { need: crmGroupId });
  const group = roster.groups.find((item) => item.crmGroupId === crmGroupId);
  if (!group) throw new ForbiddenError("Группа не закреплена за вами");
  return {
    crmTeacherId,
    group: {
      crmGroupId: group.crmGroupId,
      name: group.name,
      direction: group.direction,
      members: group.students.map((student) => ({ crmStudentId: student.crmStudentId, name: student.name })) as GroupMember[],
    },
  };
}

async function requireGroupSector(crmGroupId: string, planId: string) {
  const plan = await prisma.learningPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.crmGroupId !== crmGroupId) throw new NotFoundError("Сектор группы");
  if (plan.publishedVersionNumber === null) {
    throw new BadRequestError("Сектор группы ещё не опубликован", "SECTOR_NOT_PUBLISHED");
  }
  return plan;
}

async function studentUser(crmStudentId: string) {
  return prisma.user.findFirst({
    where: { crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
    select: { id: true, firstName: true },
  });
}

async function notifyMember(crmStudentId: string, message: { title: string; body: string; dedupeKey: string }) {
  try {
    const student = await studentUser(crmStudentId);
    if (!student) return;
    const { familySectorNoticeUrl, parentsSeeingPlanProgress } = await import("./parent-visibility.service.js");
    const parentIds = await parentsSeeingPlanProgress(student.id);
    const { deliverUserNotification } = await import("./notification.service.js");
    await deliverUserNotification({
      userId: student.id, type: "sector_exam_updated", title: message.title, body: message.body,
      url: "/monthly-plan", tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:student`,
    });
    await Promise.allSettled(parentIds.map((parentUserId) => deliverUserNotification({
      userId: parentUserId, type: "sector_exam_updated", title: message.title,
      body: `${student.firstName ?? "Ученик"}: ${message.body}`,
      url: familySectorNoticeUrl(student.id), tag: message.dedupeKey, dedupeKey: `${message.dedupeKey}:parent:${parentUserId}`,
    })));
  } catch {
    // The pass and the close are saved even when delivery is temporarily unavailable.
  }
}

/**
 * Records that a member passed the group's sector and pays them the sector's 250 Points, with the
 * same key family as every other sector close so the member is never paid twice. Repeating it
 * returns the saved pass. A manual pass cancels the member's exam that has not started yet.
 */
export async function recordSectorMemberPass(input: {
  planId: string;
  crmStudentId: string;
  method: "exam" | "manual";
  examId?: string | null;
  passedById: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const plan = await prisma.learningPlan.findUnique({ where: { id: input.planId } });
  if (!plan?.crmGroupId) throw new NotFoundError("Сектор группы");
  let pass;
  try {
    pass = await prisma.sectorMemberPass.create({
      data: {
        planId: plan.id,
        crmStudentId: input.crmStudentId,
        method: input.method,
        examId: input.examId ?? null,
        passedById: input.passedById,
        passedAt: now,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sectorMemberPass.findUnique({
        where: { planId_crmStudentId: { planId: plan.id, crmStudentId: input.crmStudentId } },
      });
      return { pass: existing!, awardedPoints: 0, created: false };
    }
    throw error;
  }
  if (input.method === "manual") {
    await prisma.sectorExam.updateMany({
      where: { planId: plan.id, crmStudentId: input.crmStudentId, status: { in: ["draft", "awaiting_schedule", "scheduled"] } },
      data: { status: "cancelled", cancelledAt: now, cancelReason: "Сектор засчитан без экзамена" },
    });
  }
  const user = await studentUser(input.crmStudentId);
  let awardedPoints = 0;
  // Like the exam close of an individual sector, a pass is live after the economy cutover.
  if (user) {
    const award = await awardSystemPoints({
      studentId: user.id,
      amount: NON_EMPTY_PLAN_COMPLETION_POINTS,
      reason: `Сдан сектор группы ${plan.sequence}`,
      sourceKey: `learning-plan-completion:${plan.id}:${user.id}`,
      eventAt: now,
    });
    awardedPoints = award.awarded ? NON_EMPTY_PLAN_COMPLETION_POINTS : 0;
    if (awardedPoints) {
      pass = await prisma.sectorMemberPass.update({ where: { id: pass.id }, data: { pointsAwarded: awardedPoints } });
    }
  }
  await notifyMember(input.crmStudentId, {
    title: `Сектор группы ${plan.sequence} сдан`,
    body: `${input.method === "exam" ? "Экзамен сдан." : "Преподаватель засчитал сектор."}${awardedPoints ? ` Начислено ${awardedPoints} баллов.` : ""}`,
    dedupeKey: `sector-member-pass:${pass.id}`,
  });
  return { pass, awardedPoints, created: true };
}

/** The teacher counts a member's group sector as passed without an exam. */
export async function passGroupSectorMemberManually(
  teacherUserId: string,
  crmGroupId: string,
  planId: string,
  crmStudentId: string,
) {
  const { group } = await requireTeacherGroup(teacherUserId, crmGroupId);
  await requireGroupSector(crmGroupId, planId);
  const inGroup = group.members.some((member) => member.crmStudentId === crmStudentId);
  const sat = inGroup || await prisma.sectorExam.count({ where: { planId, crmStudentId } }) > 0;
  if (!sat) throw new BadRequestError("Ученик не состоит в этой группе", "GROUP_MEMBER_NOT_FOUND");
  const started = await prisma.sectorExam.count({ where: { planId, crmStudentId, status: "in_progress" } });
  if (started) {
    throw new ConflictError("У ученика идёт экзамен: завершите его", "SECTOR_EXAM_IN_PROGRESS");
  }
  const result = await recordSectorMemberPass({ planId, crmStudentId, method: "manual", passedById: teacherUserId });
  return { crmStudentId, method: result.pass.method, passedAt: result.pass.passedAt, awardedPoints: result.awardedPoints };
}

/**
 * The group moves on: its teacher closes the open sector, whoever has passed. Members who have
 * not passed keep their exams (and can still be counted). Closing pays nothing by itself.
 */
export async function closeGroupSector(teacherUserId: string, crmGroupId: string, planId: string, now = new Date()) {
  const { group } = await requireTeacherGroup(teacherUserId, crmGroupId);
  const plan = await requireGroupSector(crmGroupId, planId);
  const passedByExam = await prisma.sectorMemberPass.count({ where: { planId, method: "exam" } });
  const closed = await prisma.learningPlan.updateMany({
    where: { id: plan.id, status: "active" },
    data: {
      status: "closed",
      closedAt: now,
      closeReason: passedByExam ? "exam" : "manual",
      completedAt: plan.completedAt ?? now,
      lockedAt: plan.lockedAt ?? now,
      completionRewardSourceKey: plan.completionRewardSourceKey ?? `learning-plan-completion:${plan.id}`,
    },
  });
  if (!closed.count) throw new ConflictError("Сектор группы уже закрыт. Обновите страницу.", "SECTOR_ALREADY_CLOSED");
  // An exam prepared but never sent to the school has nobody to wait for.
  await prisma.sectorExam.updateMany({
    where: { planId: plan.id, status: "draft" },
    data: { status: "cancelled", cancelledAt: now, cancelReason: "Сектор группы закрыт" },
  });
  await Promise.all(group.members.map((member) => notifyMember(member.crmStudentId, {
    title: `Сектор группы ${plan.sequence} закрыт`,
    body: `${group.name}: группа переходит к следующему сектору.`,
    dedupeKey: `group-sector-closed:${plan.id}:${member.crmStudentId}`,
  })));
  return { planId: plan.id, sequence: plan.sequence, closedAt: now };
}

export { OPEN_EXAM_STATUSES };
