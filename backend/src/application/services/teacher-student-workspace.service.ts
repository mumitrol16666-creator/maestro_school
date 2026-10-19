import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";
import { ForbiddenError } from "../../domain/errors.js";
import { listPreparedTestTemplates } from "../../domain/prepared-tests.js";
import { getAqtobeWeekRange } from "./weekly-league-policy.js";
import { getTeacherOfflineClassStudents } from "./teacher-offline.service.js";
import { requireTeacherHomeworkStudent } from "./teacher-student-homework.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { listPublishedLearningPlansV2 } from "./learning-plan-v2.service.js";
import {
  learningHomeworkV2Enabled,
  listLearningHomeworkAssignmentsByCrmStudent,
} from "./learning-homework-v2.service.js";

/**
 * One student as the teacher sees them: the open sector with its topics and
 * test, what the student proposed, homework waiting for a decision, the last
 * lessons, platform activity (tests, course lessons, XP of the week) and the
 * dynamics of attendance and homework.
 *
 * Access follows LEARN-026: a teacher with a permanent CRM assignment (direct
 * or through a group) sees everything; a one-off substitute, identified by
 * the lesson they are running, sees only what that lesson needs — the sector
 * with its topics — and nothing of the student's history.
 */
export type TeacherStudentWorkspaceAccess =
  | { kind: "assigned"; direct: boolean }
  | { kind: "lesson"; crmClassId: string };

type OfflineSummaryLesson = {
  crmClassId: string;
  title?: string | null;
  date: string;
  startTime?: string | null;
  status: string;
  classType?: string | null;
  topic?: string | null;
  lessonSummary?: string | null;
  homework?: string | null;
  nextLessonFocus?: string | null;
  attended?: boolean | null;
  homeworkReview?: {
    status?: string | null;
    completionPercent?: number | null;
  } | null;
  learningTopicResults?: Array<{
    topicId: string;
    title: string;
    fromPercent: number;
    toPercent: number;
    mastered: boolean;
    masteryPointsAwarded: number;
  }>;
  learningPlanCompletionResults?: Array<{ planId: string; sequence?: number | null; pointsAwarded: number }>;
};

type WorkspaceStudent = {
  crmStudentId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl: string | null;
  learningLevel: string | null;
  directions: string[];
  groups: Array<{ crmGroupId: string; name: string; direction: string; level: string }>;
  attendanceHistory: Array<{ crmClassId: string; date: string; attendanceStatus: string; attended: boolean }>;
};

/** The CRM roster lists a group member with fewer fields than a directly assigned student. */
function normalizeRosterStudent(raw: {
  crmStudentId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string | null;
  learningLevel?: string | null;
  directions?: string[];
  groups?: Array<{ crmGroupId: string; name: string; direction: string; level: string }>;
  attendanceHistory?: Array<{ crmClassId: string; date: string; attendanceStatus: string; attended: boolean }>;
}): WorkspaceStudent {
  return {
    crmStudentId: raw.crmStudentId,
    name: raw.name,
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phone,
    avatarUrl: raw.avatarUrl ?? null,
    learningLevel: raw.learningLevel ?? null,
    directions: raw.directions ?? [],
    groups: raw.groups ?? [],
    attendanceHistory: (raw.attendanceHistory ?? []).map((item) => ({
      crmClassId: item.crmClassId,
      date: item.date,
      attendanceStatus: item.attendanceStatus,
      attended: item.attended,
    })),
  };
}

const FINISHED_LESSON_STATUSES = new Set(["completed", "confirmed", "approved", "finished", "held"]);
const RECENT_LESSONS = 3;
const RECENT_TESTS = 10;
const RECENT_COURSE_LESSONS = 5;
const HOMEWORK_WINDOW_DAYS = 30;

async function resolveAccess(
  teacherUserId: string,
  crmStudentId: string,
  crmClassId: string | undefined,
) {
  try {
    const scope = await requireTeacherHomeworkStudent(teacherUserId, crmStudentId);
    return {
      access: { kind: "assigned" as const, direct: scope.directlyAssigned },
      student: normalizeRosterStudent(scope.student),
      groupIds: scope.groupIds,
    };
  } catch (error) {
    if (!(error instanceof ForbiddenError) || !crmClassId) throw error;
  }
  // Not on the roster: the lesson itself may still give access (substitute).
  const roster = await getTeacherOfflineClassStudents(teacherUserId, crmClassId) as {
    students?: Array<{ crmStudentId?: string; name?: string; avatarUrl?: string | null; direction?: string | null }>;
    lesson?: { group?: { crmGroupId?: string | null } | null } | null;
  };
  const rosterStudent = (roster.students ?? []).find((item) => item.crmStudentId === crmStudentId);
  if (!rosterStudent) {
    throw new ForbiddenError("Ученик не закреплён за вами и не участвует в этом уроке");
  }
  const crmGroupId = roster.lesson?.group?.crmGroupId ?? null;
  return {
    access: { kind: "lesson" as const, crmClassId },
    student: normalizeRosterStudent({
      crmStudentId,
      name: rosterStudent.name ?? "Ученик",
      avatarUrl: rosterStudent.avatarUrl ?? null,
      directions: rosterStudent.direction ? [rosterStudent.direction] : [],
    }),
    groupIds: crmGroupId ? [crmGroupId] : [],
  };
}

function recentLessonDto(lesson: OfflineSummaryLesson) {
  return {
    crmClassId: lesson.crmClassId,
    date: lesson.date,
    startTime: lesson.startTime ?? null,
    title: lesson.topic?.trim() || lesson.title?.trim() || "Урок",
    attended: lesson.attended ?? null,
    lessonSummary: lesson.lessonSummary ?? null,
    homework: lesson.homework ?? null,
    nextLessonFocus: lesson.nextLessonFocus ?? null,
    homeworkReview: lesson.homeworkReview
      ? { status: lesson.homeworkReview.status ?? null, completionPercent: lesson.homeworkReview.completionPercent ?? null }
      : null,
    topicResults: (lesson.learningTopicResults ?? []).map((item) => ({
      topicId: item.topicId,
      title: item.title,
      fromPercent: item.fromPercent,
      toPercent: item.toPercent,
      mastered: item.mastered,
      masteryPointsAwarded: item.masteryPointsAwarded,
    })),
    sectorClosed: (lesson.learningPlanCompletionResults ?? []).map((item) => ({
      planId: item.planId,
      sequence: item.sequence ?? null,
      pointsAwarded: item.pointsAwarded,
    })),
  };
}

async function loadRecentLessons(appUserId: string | null, crmStudentId: string) {
  try {
    const summary = (appUserId
      ? await getStudentSchoolOfflineSummary(appUserId)
      : await fetchStudentOfflineSummary(crmStudentId)) as { lessonHistory?: OfflineSummaryLesson[] };
    const history = (summary.lessonHistory ?? [])
      .filter((lesson) => FINISHED_LESSON_STATUSES.has(String(lesson.status)))
      .sort((left, right) => `${right.date} ${right.startTime ?? ""}`.localeCompare(`${left.date} ${left.startTime ?? ""}`));
    return { available: true as const, items: history.slice(0, RECENT_LESSONS).map(recentLessonDto) };
  } catch {
    return { available: false as const, items: [] };
  }
}

function homeworkItemDto(assignment: Awaited<ReturnType<typeof listLearningHomeworkAssignmentsByCrmStudent>>[number]) {
  const latest = assignment.latestAttempt;
  return {
    recipientId: assignment.recipientId,
    assignmentId: assignment.id,
    topic: { id: assignment.topic.id, title: assignment.topic.title, scope: assignment.topic.scope },
    state: assignment.state,
    currentCycle: assignment.currentCycle,
    assignedAt: assignment.assignedAt,
    dueAt: assignment.dueAt,
    acceptedAt: assignment.acceptedAt,
    instructions: assignment.instructions,
    sourceLessonId: assignment.sourceLessonId,
    attemptsCount: assignment.attempts.length,
    latestAttempt: latest
      ? {
          id: latest.id,
          cycleNumber: latest.cycleNumber,
          versionInCycle: latest.versionInCycle,
          status: latest.status,
          submittedAt: latest.submittedAt,
          review: latest.review
            ? { decision: latest.review.decision, comment: latest.review.comment, reviewedAt: latest.review.reviewedAt }
            : null,
        }
      : null,
    reviewHref: latest ? `/admin/homework-review/${assignment.recipientId}` : null,
  };
}

export async function getTeacherStudentWorkspace(
  teacherUserId: string,
  crmStudentId: string,
  options: { crmClassId?: string; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const { access, student, groupIds } = await resolveAccess(teacherUserId, crmStudentId, options.crmClassId);
  const appUser = await prisma.user.findFirst({
    where: { crmStudentId, deletedAt: null, isActive: true },
    select: { id: true, firstName: true, lastName: true, avatar: true },
  });
  const appUserId = appUser?.id ?? null;
  const limited = access.kind === "lesson";

  const sectors = await listPublishedLearningPlansV2(crmStudentId, groupIds);

  if (limited) {
    return {
      generatedAt: now.toISOString(),
      access,
      student: studentDto(student, appUserId, appUser?.avatar ?? null, null, null, []),
      sectors,
      proposals: [],
      homework: { available: false as const, waitingCount: 0, items: [] },
      recentLessons: { available: false as const, items: [] },
      tests: [],
      courses: [],
      weekXp: null,
      dynamics: null,
    };
  }

  const week = getAqtobeWeekRange(now);
  const homeworkSince = new Date(now.getTime() - HOMEWORK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [
    proposals,
    assignments,
    recentLessons,
    testAttempts,
    courseLessons,
    weekEvents,
    lastActivity,
    lastLogin,
    parents,
  ] = await Promise.all([
    prisma.learningSectorProposal.findMany({
      where: { crmStudentId, status: "new" },
      orderBy: { createdAt: "asc" },
      include: { direction: { select: { crmDirectionId: true, title: true } } },
    }),
    learningHomeworkV2Enabled() ? listLearningHomeworkAssignmentsByCrmStudent(crmStudentId) : Promise.resolve([]),
    loadRecentLessons(appUserId, crmStudentId),
    appUserId
      ? prisma.preparedTestAttempt.findMany({
          where: { studentId: appUserId },
          orderBy: { createdAt: "desc" },
          take: RECENT_TESTS,
          select: { id: true, testId: true, attemptNumber: true, score: true, passed: true, correctAnswers: true, totalQuestions: true, createdAt: true },
        })
      : Promise.resolve([]),
    appUserId
      ? prisma.lessonProgress.findMany({
          where: { studentId: appUserId, status: { in: ["in_progress", "submitted", "reviewed", "completed"] } },
          orderBy: { updatedAt: "desc" },
          take: RECENT_COURSE_LESSONS,
          select: {
            status: true,
            completedAt: true,
            updatedAt: true,
            lesson: { select: { id: true, title: true, module: { select: { title: true, course: { select: { id: true, title: true } } } } } },
          },
        })
      : Promise.resolve([]),
    appUserId
      ? prisma.leagueXpEvent.findMany({
          where: { studentId: appUserId, reversedAt: null, createdAt: { gte: week.start, lt: week.end } },
          select: { amount: true, sourceType: true, description: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    appUserId
      ? prisma.appUsageEvent.findFirst({ where: { userId: appUserId }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } })
      : Promise.resolve(null),
    appUserId
      ? prisma.appUsageEvent.findFirst({ where: { userId: appUserId, eventType: "login" }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } })
      : Promise.resolve(null),
    appUserId
      ? prisma.parentStudentLink.findMany({
          where: {
            studentUserId: appUserId,
            isActive: true,
            revokedAt: null,
            parent: { isActive: true, deletedAt: null, role: { slug: "parent" } },
          },
          orderBy: { createdAt: "asc" },
          select: {
            parentUserId: true,
            relationship: true,
            parent: { select: { firstName: true, lastName: true, middleName: true, login: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const templates = new Map(listPreparedTestTemplates().map((item) => [item.id, item.title]));
  const homeworkItems = assignments.map(homeworkItemDto);
  const waitingCount = homeworkItems.filter((item) => item.state === "waiting_review").length;
  const recentDecisions = assignments.flatMap((assignment) => (
    assignment.attempts
      .map((attempt) => attempt.review)
      .filter((review): review is NonNullable<typeof review> => Boolean(review) && review!.reviewedAt >= homeworkSince)
  ));
  const recentAttendance = student.attendanceHistory
    .slice(0, 8)
    .map((item) => ({ crmClassId: item.crmClassId, date: item.date, attendanceStatus: item.attendanceStatus, attended: item.attended }));
  const attendedCount = recentAttendance.filter((item) => ["present", "late"].includes(item.attendanceStatus)).length;
  const bySource = new Map<string, number>();
  for (const event of weekEvents) {
    bySource.set(event.sourceType, (bySource.get(event.sourceType) ?? 0) + event.amount);
  }

  return {
    generatedAt: now.toISOString(),
    access,
    student: studentDto(
      student,
      appUserId,
      appUser?.avatar ?? null,
      lastActivity?.occurredAt ?? null,
      lastLogin?.occurredAt ?? null,
      parents.map((link) => ({
        id: link.parentUserId,
        relationship: link.relationship,
        name: [link.parent.lastName, link.parent.firstName, link.parent.middleName].map((part) => part?.trim()).filter(Boolean).join(" ")
          || link.parent.login || link.parent.email || "Родитель",
      })),
    ),
    sectors,
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      text: proposal.text,
      link: proposal.link,
      createdAt: proposal.createdAt,
      direction: { crmDirectionId: proposal.direction.crmDirectionId, title: proposal.direction.title },
    })),
    homework: { available: learningHomeworkV2Enabled(), waitingCount, items: homeworkItems },
    recentLessons,
    tests: testAttempts.map((attempt) => ({
      id: attempt.id,
      testId: attempt.testId,
      title: templates.get(attempt.testId) ?? attempt.testId,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      passed: attempt.passed,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      createdAt: attempt.createdAt,
    })),
    courses: courseLessons.map((progress) => ({
      lessonId: progress.lesson.id,
      lessonTitle: progress.lesson.title,
      moduleTitle: progress.lesson.module.title,
      courseId: progress.lesson.module.course.id,
      courseTitle: progress.lesson.module.course.title,
      status: progress.status,
      completedAt: progress.completedAt,
      updatedAt: progress.updatedAt,
    })),
    weekXp: {
      weekKey: week.key,
      total: weekEvents.reduce((sum, event) => sum + event.amount, 0),
      bySource: [...bySource.entries()].map(([sourceType, amount]) => ({ sourceType, amount })),
      events: weekEvents.slice(0, 12),
    },
    dynamics: {
      attendance: {
        rate: recentAttendance.length ? Math.round((attendedCount / recentAttendance.length) * 100) : null,
        recent: recentAttendance,
      },
      homework: {
        windowDays: HOMEWORK_WINDOW_DAYS,
        accepted: recentDecisions.filter((review) => ["accepted", "accepted_with_comment"].includes(review.decision)).length,
        revision: recentDecisions.filter((review) => review.decision === "revision").length,
        waiting: waitingCount,
        assigned: homeworkItems.filter((item) => item.state === "assigned").length,
      },
      sectors: sectors.map((sector) => ({
        id: sector.id,
        sequence: sector.sequence,
        scope: sector.scope,
        direction: sector.direction.title,
        completed: sector.progress.completed,
        total: sector.progress.total,
        percent: sector.progress.percent,
        testPassedAt: sector.preparedTest?.passedAt ?? null,
      })),
    },
  };
}

function studentDto(
  student: WorkspaceStudent,
  appUserId: string | null,
  appAvatar: string | null,
  lastActiveAt: Date | null,
  lastLoginAt: Date | null,
  parents: Array<{ id: string; name: string; relationship: string }>,
) {
  return {
    crmStudentId: student.crmStudentId,
    appUserId,
    name: student.name,
    phone: student.phone ?? null,
    avatarUrl: appAvatar ?? student.avatarUrl ?? null,
    learningLevel: student.learningLevel ?? null,
    directions: student.directions,
    groups: student.groups,
    appActivity: { lastActiveAt, lastLoginAt, linked: Boolean(appUserId) },
    parents,
  };
}
