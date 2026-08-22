import { BadRequestError } from "../../domain/errors.js";
import {
  buildOfflineHomework,
  offlineHomeworkStatus,
  selectOfflineHomeworks,
} from "../../domain/offline-homework-selection.js";
import { getStudentRank } from "../../domain/student-rank.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { listPublishedGroupMonthlyPlans } from "./group-monthly-plan.service.js";
import { getStudentDashboard } from "./student-dashboard.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { listPublishedStudentMonthlyPlans } from "./student-monthly-plan.service.js";

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

function getNextMonthKey(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthNum = parseInt(monthStr, 10) || 1;
  if (monthNum >= 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(monthNum + 1).padStart(2, "0")}`;
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
  let plans = [...studentPlans, ...groupPlans];
  if (!plans.length) {
    const nextMonth = getNextMonthKey(month);
    const [nextStudentPlans, nextGroupPlans] = await Promise.all([
      listPublishedStudentMonthlyPlans(user.crmStudentId, nextMonth),
      listPublishedGroupMonthlyPlans(groupIds, nextMonth),
    ]);
    plans = [...nextStudentPlans, ...nextGroupPlans];
  }
  return plans;
}
