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
import { getStudentTasks } from "./student-tasks.service.js";
import { getStudentAchievementsOverview } from "./achievement.service.js";
import { listStudentSectorProposals } from "./sector-proposal.service.js";
import { buildStudentToday, STUDENT_BANNER_TYPES, type TodayLesson } from "../../domain/student-today.js";
import { getPracticeStatus } from "./practice-reminder.service.js";

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

export const HOME_TASKS_LIMIT = 6;

/**
 * Package 3 (В-18): `school: null` alone cannot tell a student the school has not linked yet from
 * a school read that failed (CRM down and no server copy); the home names which one it is.
 */
export type StudentHomeSchoolStatus = "linked" | "not_linked" | "unavailable";

/**
 * Plan 2.1: everything the student's «Сейчас», «Обучение» and the header need, in one read.
 * Tasks, achievements and proposals are platform data; the only CRM read is the cached summary.
 * Each extra is optional: one that fails leaves its block empty instead of failing the home.
 */
async function homeExtras(studentUserId: string) {
  const [tasks, achievements, proposals] = await Promise.allSettled([
    getStudentTasks(studentUserId, { scope: "active", limit: HOME_TASKS_LIMIT }),
    getStudentAchievementsOverview(studentUserId),
    listStudentSectorProposals(studentUserId),
  ]);
  return {
    tasks: tasks.status === "fulfilled"
      ? { items: tasks.value.data.items, counts: tasks.value.data.counts, partial: tasks.value.meta.partial }
      : null,
    achievementsEarned: achievements.status === "fulfilled"
      ? achievements.value.filter((item) => item.earned).length
      : null,
    sectorProposals: proposals.status === "fulfilled" ? proposals.value : [],
  };
}

/** Plan 5.2: unread notifications shown as banners; plan 5.1: the current streak for «Сегодня». */
async function homeSignals(studentUserId: string) {
  const [banners, streak, practice] = await Promise.allSettled([
    prisma.userNotification.findMany({
      where: { userId: studentUserId, readAt: null, type: { in: [...STUDENT_BANNER_TYPES] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, body: true, url: true, createdAt: true },
    }),
    prisma.weeklyStreakState.findFirst({ where: { studentId: studentUserId }, orderBy: { updatedAt: "desc" }, select: { currentWeeks: true } }),
    getPracticeStatus(studentUserId),
  ]);
  return {
    banners: banners.status === "fulfilled" ? banners.value : [],
    streakWeeks: streak.status === "fulfilled" ? streak.value?.currentWeeks ?? 0 : null,
    practice: practice.status === "fulfilled" ? practice.value : null,
  };
}

export async function getStudentHome(studentUserId: string) {
  const [base, extras, signals] = await Promise.all([
    getStudentHomeBase(studentUserId),
    homeExtras(studentUserId),
    homeSignals(studentUserId),
  ]);
  const upcoming = (base.school as { upcomingLessons?: TodayLesson[] } | null)?.upcomingLessons ?? [];
  const today = buildStudentToday({ upcomingLessons: upcoming, tasks: extras.tasks?.items ?? [] });
  return { ...base, ...extras, ...signals, today };
}

async function getStudentHomeBase(studentUserId: string) {
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
      schoolStatus: "not_linked" as StudentHomeSchoolStatus,
      monthlyPlans: [],
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
      generatedAt: new Date().toISOString(),
      dashboard,
      school: null,
      schoolStatus: "unavailable" as StudentHomeSchoolStatus,
      monthlyPlans,
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
  // Plan 2.4: CRM's legacy homework is read in the lesson history only; tasks are homework v2.
  return {
    generatedAt: new Date().toISOString(),
    dashboard,
    school,
    schoolStatus: "linked" as StudentHomeSchoolStatus,
    monthlyPlans,
  };
}

export async function getPublishedMonthlyPlansForStudent(
  studentUserId: string,
  month: string,
  options: {
    requireLinkedProfile?: boolean;
    schoolSummary?: StudentSchoolSummary | null;
    includeClosed?: boolean;
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
  const plans = await listPublishedMonthlyPlansAdapted(user.crmStudentId, groupIds, month, { includeClosed: options.includeClosed });
  return plans.sort((left, right) => (
    left.teacher.name.localeCompare(right.teacher.name, "ru-RU")
    || left.id.localeCompare(right.id)
  ));
}
