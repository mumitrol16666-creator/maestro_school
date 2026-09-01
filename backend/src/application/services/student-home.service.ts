import { BadRequestError } from "../../domain/errors.js";
import {
  buildOfflineHomework,
  offlineHomeworkStatus,
  selectOfflineHomeworks,
} from "../../domain/offline-homework-selection.js";
import { getStudentRank } from "../../domain/student-rank.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { getStudentDashboard } from "./student-dashboard.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { listPublishedMonthlyPlansAdapted } from "./monthly-plan-adapter.service.js";

// Re-export pure domain functions so existing consumers keep working.
export { buildOfflineHomework, offlineHomeworkStatus, selectOfflineHomeworks };

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
  homeworkReview?: {
    status?: string | null;
    completionPercent?: number | null;
    difficulties?: string | null;
    notCompletedReason?: string | null;
  } | null;
};

type StudentSchoolSummary = {
  profile?: { groups?: Array<{ crmGroupId?: string | null }> };
};

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
        totalLessonsCount: 0, points: 0, rank: getStudentRank(0), level: null,
        nextAvailableLesson: null,
      };
  if (schoolResult.status === "rejected") {
    const monthlyPlans = await listPublishedMonthlyPlansAdapted(
      user.crmStudentId,
      [],
      aqtobeMonthKey(),
    );
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
  const monthlyPlans = await getPublishedMonthlyPlansForStudent(studentUserId, month, {
    schoolSummary: school,
  });
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
  options: {
    requireLinkedProfile?: boolean;
    schoolSummary?: StudentSchoolSummary | null;
  } = {},
) {
  const user = await prisma.user.findUnique({
    where: { id: studentUserId },
    select: { crmStudentId: true },
  });
  if (!user?.crmStudentId) {
    if (options.requireLinkedProfile) {
      throw new BadRequestError(
        "Профиль школы не подключён. Обратитесь к администратору Maestro.",
        "CRM_NOT_LINKED",
      );
    }
    return [];
  }
  let schoolSummary = options.schoolSummary;
  if (schoolSummary === undefined) {
    try {
      schoolSummary = await getStudentSchoolOfflineSummary(studentUserId) as StudentSchoolSummary;
    } catch {
      schoolSummary = null;
    }
  }

  const groupIds = [...new Set(
    (schoolSummary?.profile?.groups ?? [])
      .map((group) => group.crmGroupId?.trim() ?? "")
      .filter(Boolean),
  )];
  const plans = await listPublishedMonthlyPlansAdapted(user.crmStudentId, groupIds, month);
  return plans.sort((left, right) => (
    left.teacher.name.localeCompare(right.teacher.name, "ru-RU")
    || left.id.localeCompare(right.id)
  ));
}
