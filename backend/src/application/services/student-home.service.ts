import { BadRequestError } from "../../domain/errors.js";
import { getStudentRank } from "../../domain/student-rank.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { listPublishedGroupMonthlyPlans } from "./group-monthly-plan.service.js";
import { getStudentDashboard } from "./student-dashboard.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { listPublishedStudentMonthlyPlans } from "./student-monthly-plan.service.js";

type HomeworkReview = {
  status?: string | null;
  completionPercent?: number | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
};

type OfflineLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  roomName?: string | null;
  topic?: string | null;
  lessonSummary?: string | null;
  homework?: string | null;
  homeworkReview?: HomeworkReview | null;
};

export function offlineHomeworkStatus(review?: HomeworkReview | null) {
  if (review?.status === "completed") return "completed" as const;
  if (review?.status === "partial" || review?.status === "not_completed") return "needs_revision" as const;
  return "todo" as const;
}

function sameLessonStream(left: OfflineLesson, right: OfflineLesson) {
  if (left.crmGroupId || right.crmGroupId) return Boolean(left.crmGroupId && left.crmGroupId === right.crmGroupId);
  return Boolean(left.crmTeacherId && left.crmTeacherId === right.crmTeacherId);
}

export function buildOfflineHomework(lesson: OfflineLesson, upcoming: OfflineLesson[]) {
  const nextLesson = upcoming.find((candidate) => sameLessonStream(lesson, candidate)) ?? null;
  return {
    id: `offline:${lesson.crmClassId}`,
    sourceLessonId: lesson.crmClassId,
    title: lesson.topic?.trim() || "Домашнее задание после урока",
    description: lesson.homework?.trim() || "",
    status: offlineHomeworkStatus(lesson.homeworkReview),
    teacherName: lesson.teacherName ?? null,
    assignedAt: lesson.date,
    due: nextLesson ? {
      kind: "next_lesson" as const,
      date: nextLesson.date,
      time: nextLesson.startTime,
      lessonId: nextLesson.crmClassId,
    } : null,
    review: lesson.homeworkReview ? {
      status: lesson.homeworkReview.status ?? "not_checked",
      completionPercent: lesson.homeworkReview.completionPercent ?? null,
      feedback: lesson.homeworkReview.difficulties
        || lesson.homeworkReview.notCompletedReason
        || null,
    } : null,
    href: `/school-lessons?tab=homework&lesson=${encodeURIComponent(lesson.crmClassId)}`,
  };
}

export function selectOfflineHomeworks(history: OfflineLesson[], upcoming: OfflineLesson[]) {
  const withHomework = history.filter((lesson) => lesson.homework?.trim());
  const active = withHomework.find((lesson) => offlineHomeworkStatus(lesson.homeworkReview) !== "completed")
    ?? withHomework[0]
    ?? null;
  const reviewed = withHomework.find((lesson) => (
    lesson.homeworkReview
    && !["not_checked", "not_assigned"].includes(lesson.homeworkReview.status ?? "not_checked")
  )) ?? null;
  return {
    currentHomework: active ? buildOfflineHomework(active, upcoming) : null,
    lastHomeworkReview: reviewed ? buildOfflineHomework(reviewed, upcoming) : null,
  };
}

export async function getStudentHome(studentUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: studentUserId },
    select: { crmStudentId: true },
  });
  if (!user?.crmStudentId) {
    const dashboard = await getStudentDashboard(studentUserId);
    return {
      generatedAt: new Date().toISOString(),
      dashboard,
      school: null,
      monthlyPlans: [],
      currentHomework: null,
      lastHomeworkReview: null,
    };
  }

  const [dashboardResult, schoolResult] = await Promise.allSettled([
    getStudentDashboard(studentUserId),
    getStudentSchoolOfflineSummary(studentUserId),
  ]);
  const dashboard = dashboardResult.status === "fulfilled"
    ? dashboardResult.value
    : {
        currentCourse: null, progressPercent: 0, completedLessonsCount: 0,
        totalLessonsCount: 0, points: 0, rank: getStudentRank(0), nextAvailableLesson: null,
      };
  if (schoolResult.status === "rejected") {
    const monthlyPlans = await listPublishedStudentMonthlyPlans(user.crmStudentId, aqtobeMonthKey());
    if (dashboardResult.status === "rejected" && !monthlyPlans.length) {
      throw new BadRequestError("Не удалось собрать учебную главную", "STUDENT_HOME_UNAVAILABLE");
    }
    return {
      generatedAt: new Date().toISOString(), dashboard, school: null,
      monthlyPlans, currentHomework: null, lastHomeworkReview: null,
    };
  }

  const school = schoolResult.value as unknown as {
    profile?: { groups?: Array<{ crmGroupId?: string | null }> };
    upcomingLessons?: OfflineLesson[];
    lessonHistory?: OfflineLesson[];
    [key: string]: unknown;
  };
  const month = aqtobeMonthKey();
  const monthlyPlans = await getPublishedMonthlyPlansForStudent(studentUserId, month, school);
  const upcoming = school.upcomingLessons ?? [];
  const homeworks = selectOfflineHomeworks(school.lessonHistory ?? [], upcoming);

  return {
    generatedAt: new Date().toISOString(),
    dashboard,
    school,
    monthlyPlans,
    ...homeworks,
  };
}

export async function getPublishedMonthlyPlansForStudent(
  studentUserId: string,
  month: string,
  schoolSummary?: { profile?: { groups?: Array<{ crmGroupId?: string | null }> } } | null,
) {
  const user = await prisma.user.findUnique({
    where: { id: studentUserId },
    select: { crmStudentId: true },
  });
  if (!user?.crmStudentId) return [];
  const school = schoolSummary ?? await getStudentSchoolOfflineSummary(studentUserId) as {
    profile?: { groups?: Array<{ crmGroupId?: string | null }> };
  };
  const groupIds = (school.profile?.groups ?? [])
    .map((group) => group.crmGroupId ?? "")
    .filter(Boolean);
  const [studentPlans, groupPlans] = await Promise.all([
    listPublishedStudentMonthlyPlans(user.crmStudentId, month),
    listPublishedGroupMonthlyPlans(groupIds, month),
  ]);
  return [...studentPlans, ...groupPlans];
}
