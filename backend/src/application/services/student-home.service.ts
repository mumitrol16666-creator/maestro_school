import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  buildOfflineHomework,
  offlineHomeworkStatus,
  selectOfflineHomeworks,
} from "../../domain/offline-homework-selection.js";
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
 * a school read that failed; the home names which one it is. `unavailable`: CRM did not answer and
 * the server kept no copy; `failed`: CRM answered with a refusal or an error of its own (student
 * not found, a rejected secret, a CRM 500) or the summary could not be built.
 */
export type StudentHomeSchoolStatus = "linked" | "not_linked" | "unavailable" | "failed";

/**
 * CRM did not answer at all — the codes «Расписание» names «Нет связи со школой» by, so the strip
 * on the home and the schedule screen say the same. A CRM that answers 500 is `failed` on both.
 */
function isCrmOutage(reason: unknown) {
  return reason instanceof AppError && (reason.code === "CRM_UNAVAILABLE" || reason.code === "CRM_TIMEOUT");
}

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

/**
 * Plan 5.2: unread notifications shown as banners (the newest five) and how many there are in all,
 * so «Ещё N» on the home and the line on «Обучение» count every one. В-31: the weekly streak is
 * no longer on the home, it lives in the league.
 */
async function homeSignals(studentUserId: string) {
  const bannerWhere = { userId: studentUserId, readAt: null, type: { in: [...STUDENT_BANNER_TYPES] } };
  const [banners, bannersTotal, practice] = await Promise.allSettled([
    prisma.userNotification.findMany({
      where: bannerWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, body: true, url: true, createdAt: true },
    }),
    prisma.userNotification.count({ where: bannerWhere }),
    getPracticeStatus(studentUserId),
  ]);
  const shown = banners.status === "fulfilled" ? banners.value : [];
  return {
    banners: shown,
    bannersTotal: bannersTotal.status === "fulfilled" ? Math.max(bannersTotal.value, shown.length) : shown.length,
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
        totalLessonsCount: 0, points: 0, rank: null, level: null,
        nextAvailableLesson: null,
      };
  if (schoolResult.status === "rejected") {
    const schoolStatus: StudentHomeSchoolStatus = isCrmOutage(schoolResult.reason) ? "unavailable" : "failed";
    if (schoolStatus === "failed") {
      console.error("[student-home] school summary refused", {
        studentUserId,
        code: schoolResult.reason instanceof AppError ? schoolResult.reason.code : undefined,
        message: schoolResult.reason instanceof Error ? schoolResult.reason.message : String(schoolResult.reason),
      });
    }
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
      schoolStatus,
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
