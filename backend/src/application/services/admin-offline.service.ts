import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchAdminOfflineClasses,
  fetchPendingReviewClasses,
  postTeacherMarkNotHeld,
  postTeacherStart,
  postTeacherSubmit,
  postAdminApproveClass,
  postAdminAttendance,
  postAdminReopenClass,
  postAdminReturnClass,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";
import { BadRequestError } from "../../domain/errors.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";
import { validateOfflineLessonSubmission } from "./offline-lesson-submission-policy.js";
import { awardManualPoints } from "./points.service.js";
import { addMaestroCoins } from "./coins.service.js";
import { awardLeagueXp } from "./weekly-league.service.js";
import { evaluateAchievements } from "./achievement.service.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { buildMonthlyPlanSnapshot } from "../../domain/monthly-plan.js";

type AdminOfflineLesson = {
  teacher?: { crmTeacherId?: string; name?: string } | null;
  classType?: string | null;
  group?: unknown;
  [key: string]: unknown;
};

type StoredPlanTopicUpdate = {
  itemId: string;
  status: "in_progress" | "completed";
};

type StoredMonthlyPlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

function lessonMonth(lesson: Record<string, unknown>) {
  const date = typeof lesson.date === "string" ? new Date(lesson.date) : null;
  return date && !Number.isNaN(date.getTime()) ? aqtobeMonthKey(date) : aqtobeMonthKey();
}

async function applyOfflineLessonLearningResults(crmClassId: string, approvedBy: string) {
  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId, rewardsAppliedAt: null },
  });
  const results: Array<{
    crmStudentId: string;
    points: number;
    coins: number;
    planTopics: number;
  }> = [];

  for (const check of checks) {
    const attended = ["present", "late"].includes(check.attendanceStatus);
    if (!attended) {
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({ crmStudentId: check.crmStudentId, points: 0, coins: 0, planTopics: 0 });
      continue;
    }

    const updates = Array.isArray(check.planTopicUpdates)
      ? check.planTopicUpdates as StoredPlanTopicUpdate[]
      : [];
    let appliedPlanTopics = 0;
    let completedPlanId: string | null = null;
    const completedPlanTopics: Array<{ id: string; title: string }> = [];

    if (check.monthlyPlanId && updates.length) {
      const plan = await prisma.studentMonthlyPlan.findFirst({
        where: {
          id: check.monthlyPlanId,
          crmStudentId: check.crmStudentId,
        },
      });
      if (plan) {
        completedPlanId = plan.id;
        const byId = new Map(updates.map((item) => [item.itemId, item.status]));
        const items = (Array.isArray(plan.items) ? plan.items : []) as StoredMonthlyPlanItem[];
        const nextItems = items.map((item) => {
          const nextStatus = byId.get(item.id);
          if (!nextStatus || item.status === "moved") return item;
          appliedPlanTopics += 1;
          if (nextStatus === "completed" && item.status !== "completed") {
            completedPlanTopics.push({ id: item.id, title: item.title });
          }
          return {
            ...item,
            status: item.status === "completed" ? "completed" : nextStatus,
          };
        });
        const nextRevision = plan.draftRevision + 1;
        const publishedSnapshot = plan.publishedAt && plan.publishedSnapshot
          ? buildMonthlyPlanSnapshot({ ...plan, items: nextItems })
          : null;
        await prisma.studentMonthlyPlan.update({
          where: { id: plan.id },
          data: {
            items: nextItems as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            ...(publishedSnapshot ? {
              publishedSnapshot: publishedSnapshot as unknown as Prisma.InputJsonValue,
              publishedRevision: nextRevision,
              publishedAt: new Date(),
            } : {}),
          },
        });
      }
    }

    const student = await prisma.user.findUnique({
      where: { crmStudentId: check.crmStudentId },
      select: { id: true },
    });
    let awardedPoints = 0;
    let awardedCoins = 0;

    if (student) {
      await awardLeagueXp({
        studentId: student.id,
        amount: 20,
        sourceType: "offline_lesson",
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        description: "Посещение офлайн-урока в школе",
        awardedById: check.teacherUserId ?? approvedBy,
      });
      if (completedPlanId) {
        for (const topic of completedPlanTopics) {
          await awardLeagueXp({
            studentId: student.id,
            amount: 3,
            sourceType: "monthly_plan",
            sourceKey: `monthly-plan-topic:${completedPlanId}:${topic.id}`,
            description: `Освоена тема плана «${topic.title}»`,
            awardedById: check.teacherUserId ?? approvedBy,
          });
        }
      }
      const pointsResult = await awardManualPoints({
        studentId: student.id,
        amount: check.lessonPoints,
        reason: "Офлайн-урок в школе",
        awardedBy: check.teacherUserId ?? approvedBy,
        idempotencyKey: `offline-lesson-points:${crmClassId}:${check.crmStudentId}`,
      });
      awardedPoints = pointsResult.awarded ? check.lessonPoints : 0;

      const coinResult = await addMaestroCoins({
        studentId: student.id,
        amount: 1,
        reason: "Посещение офлайн-урока",
        sourceType: "offline_lesson",
        sourceId: check.id,
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        createdBy: approvedBy,
      });
      awardedCoins = coinResult.awarded ? 1 : 0;
      await evaluateAchievements(student.id);
    }

    await prisma.offlineLessonStudentCheck.update({
      where: { id: check.id },
      data: { rewardsAppliedAt: new Date() },
    });
    results.push({
      crmStudentId: check.crmStudentId,
      points: awardedPoints,
      coins: awardedCoins,
      planTopics: appliedPlanTopics,
    });
  }

  return results;
}

async function getLessonWithAssignedTeacher(crmClassId: string) {
  const lesson = await fetchClassCard(crmClassId) as AdminOfflineLesson;
  const crmTeacherId = lesson.teacher?.crmTeacherId;
  if (!crmTeacherId) {
    throw new BadRequestError(
      "У урока не назначен преподаватель. Сначала назначьте его в расписании CRM.",
      "LESSON_TEACHER_REQUIRED",
    );
  }
  return { lesson, crmTeacherId };
}

export async function getPendingReviewAgenda() {
  const result = await fetchPendingReviewClasses();
  return { classes: result.classes };
}

export async function getAdminOfflineAgenda() {
  return fetchAdminOfflineClasses();
}

export async function getAdminOfflineClass(crmClassId: string) {
  return fetchClassCard(crmClassId);
}

export async function getAdminOfflineClassStudents(crmClassId: string) {
  const [lesson, roster] = await Promise.all([
    fetchClassCard(crmClassId) as Promise<AdminOfflineLesson>,
    fetchClassStudents(crmClassId),
  ]);
  const crmTeacherId = lesson.teacher?.crmTeacherId;
  const teacher = crmTeacherId
    ? await prisma.user.findUnique({ where: { crmTeacherId }, select: { id: true } })
    : null;
  return mergeOfflineLessonStudentChecks(crmClassId, roster, {
    teacherUserId: teacher?.id,
    month: lessonMonth(lesson),
  });
}

export async function adminOfflineStart(crmClassId: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  return postTeacherStart(crmClassId, crmTeacherId);
}

export async function adminOfflineSubmit(
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const { lesson, crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  const roster = await mergeOfflineLessonStudentChecks(crmClassId, await fetchClassStudents(crmClassId));
  const validation = validateOfflineLessonSubmission({
    lesson,
    students: roster.students,
    payload,
  });
  if (!validation.valid) {
    throw new BadRequestError(validation.message, validation.code);
  }

  return postTeacherSubmit(crmClassId, {
    ...payload,
    teacherOutcomeHint: validation.outcome,
    crmTeacherId,
  });
}

export async function adminOfflineMarkNotHeld(crmClassId: string, comment: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function adminOfflineSetAttendance(
  crmClassId: string,
  studentId: string,
  attendanceStatus: string,
  teacherNote?: string,
  homeworkReview?: OfflineHomeworkReviewInput,
  lessonPoints?: number,
  monthlyPlanId?: string | null,
  planTopicUpdates?: StoredPlanTopicUpdate[],
) {
  const crmResult = await postAdminAttendance(crmClassId, {
    studentId,
    attendanceStatus,
    teacherNote,
    attended: ["present", "late"].includes(attendanceStatus),
  });
  const lessonCheck = await saveOfflineLessonStudentCheck({
    crmClassId,
    crmStudentId: studentId,
    attendanceStatus,
    teacherNote,
    homeworkReview,
    lessonPoints,
    monthlyPlanId,
    planTopicUpdates,
  });
  return { crmResult, lessonCheck };
}

export async function adminOfflineApprove(
  approvedBy: string,
  crmClassId: string,
  payload: {
    deduct?: boolean;
    topic?: string;
    lessonGoals?: string;
    lessonSummary?: string;
    homeworkDraft?: string;
    nextLessonFocus?: string;
    materials?: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }>;
    teacherComment?: string;
    trialReport?: Record<string, unknown>;
  },
) {
  const crmResult = await postAdminApproveClass(crmClassId, payload);
  const learningRewards = await applyOfflineLessonLearningResults(crmClassId, approvedBy);
  return { ...crmResult, learningRewards };
}

export async function adminOfflineReturn(crmClassId: string, reason?: string) {
  return postAdminReturnClass(crmClassId, reason);
}

export async function adminOfflineReopen(crmClassId: string, reason?: string) {
  return postAdminReopenClass(crmClassId, reason);
}
