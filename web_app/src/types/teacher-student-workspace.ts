import type { StudentHomeMonthlyPlan } from "@/types/api";

export type WorkspaceAccess =
  | { kind: "assigned"; direct: boolean }
  | { kind: "lesson"; crmClassId: string };

export type WorkspaceHomeworkItem = {
  recipientId: string;
  assignmentId: string;
  topic: { id: string; title: string; scope: "student" | "group" };
  state: "assigned" | "waiting_review" | "revision" | "accepted" | "accepted_with_comment" | string;
  currentCycle: number;
  assignedAt: string;
  dueAt: string | null;
  acceptedAt: string | null;
  instructions: string;
  sourceLessonId: string | null;
  attemptsCount: number;
  latestAttempt: {
    id: string;
    cycleNumber: number;
    versionInCycle: number;
    status: string;
    submittedAt: string;
    review: { decision: string; comment: string | null; reviewedAt: string } | null;
  } | null;
  reviewHref: string | null;
};

export type WorkspaceRecentLesson = {
  crmClassId: string;
  date: string;
  startTime: string | null;
  title: string;
  attended: boolean | null;
  lessonSummary: string | null;
  homework: string | null;
  nextLessonFocus: string | null;
  homeworkReview: { status: string | null; completionPercent: number | null } | null;
  topicResults: Array<{ topicId: string; title: string; fromPercent: number; toPercent: number; mastered: boolean; masteryPointsAwarded: number }>;
  sectorClosed: Array<{ planId: string; sequence: number | null; pointsAwarded: number }>;
};

export type TeacherStudentWorkspace = {
  generatedAt: string;
  access: WorkspaceAccess;
  student: {
    crmStudentId: string;
    appUserId: string | null;
    name: string;
    phone: string | null;
    avatarUrl: string | null;
    learningLevel: string | null;
    directions: string[];
    groups: Array<{ crmGroupId: string; name: string; direction: string; level: string }>;
    appActivity: { lastActiveAt: string | null; lastLoginAt: string | null; linked: boolean };
    parents: Array<{ id: string; name: string; relationship: string }>;
  };
  sectors: StudentHomeMonthlyPlan[];
  proposals: Array<{
    id: string;
    kind: "topic" | "song" | "goal";
    text: string;
    link: string | null;
    createdAt: string;
    direction: { crmDirectionId: string | null; title: string };
  }>;
  homework: { available: boolean; waitingCount: number; items: WorkspaceHomeworkItem[] };
  recentLessons: { available: boolean; items: WorkspaceRecentLesson[] };
  tests: Array<{
    id: string;
    testId: string;
    title: string;
    attemptNumber: number;
    score: number;
    passed: boolean;
    correctAnswers: number;
    totalQuestions: number;
    createdAt: string;
  }>;
  courses: Array<{
    lessonId: string;
    lessonTitle: string;
    moduleTitle: string;
    courseId: string;
    courseTitle: string;
    status: string;
    completedAt: string | null;
    updatedAt: string;
  }>;
  weekXp: {
    weekKey: string;
    total: number;
    bySource: Array<{ sourceType: string; amount: number }>;
    events: Array<{ amount: number; sourceType: string; description: string; createdAt: string }>;
  } | null;
  dynamics: {
    attendance: {
      rate: number | null;
      recent: Array<{ crmClassId: string; date: string; attendanceStatus: string; attended: boolean }>;
    };
    homework: { windowDays: number; accepted: number; revision: number; waiting: number; assigned: number };
    sectors: Array<{
      id: string;
      sequence: number;
      scope: "student" | "group";
      direction: string;
      completed: number;
      total: number;
      percent: number;
      testPassedAt: string | null;
    }>;
  } | null;
};

export type WorkspaceTab = "now" | "activity" | "dynamics" | "tasks" | "dialog";
