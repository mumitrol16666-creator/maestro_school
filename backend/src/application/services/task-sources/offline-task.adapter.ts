import {
  descriptionPreview,
  taskActionLabel,
  withTaskState,
  type UnifiedTask,
  type UnifiedTaskStatus,
} from "../../../domain/unified-task.js";
import { getStudentSchoolOfflineSummary } from "../school-offline.service.js";

type OfflineReview = {
  status?: string | null;
  completionPercent?: number | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
  reviewedAt?: string | null;
};

type OfflineLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime?: string | null;
  status: string;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  topic?: string | null;
  homework?: string | null;
  homeworkReview?: OfflineReview | null;
  homeworkResult?: OfflineReview | null;
  lessonPointsAwarded?: number | null;
};

function normalized(value?: string | null) {
  return value?.trim().toLocaleLowerCase("ru-RU") || "";
}

function sameLearningStream(left: OfflineLesson, right: OfflineLesson) {
  if (left.crmGroupId && right.crmGroupId) return left.crmGroupId === right.crmGroupId;
  if (left.groupName && right.groupName) return normalized(left.groupName) === normalized(right.groupName);
  if (left.crmTeacherId && right.crmTeacherId) return left.crmTeacherId === right.crmTeacherId;
  return Boolean(normalized(left.teacherName) && normalized(left.teacherName) === normalized(right.teacherName));
}

function aqtobeIso(date?: string | null, time?: string | null) {
  if (!date) return null;
  const value = `${date.slice(0, 10)}T${(time || "00:00").slice(0, 5)}:00+05:00`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function effectiveReview(lesson: OfflineLesson): OfflineReview | null {
  const direct = lesson.homeworkReview;
  if (direct && direct.status && direct.status !== "not_checked") return direct;
  return lesson.homeworkResult ?? direct ?? null;
}

function offlineStatus(review: OfflineReview | null): UnifiedTaskStatus | null {
  if (review?.status === "not_assigned") return null;
  if (review?.status === "completed") return "completed";
  if (review?.status === "partial" || review?.status === "not_completed") return "needs_revision";
  return "todo";
}

export function mapOfflineTask(
  lesson: OfflineLesson,
  upcomingLessons: OfflineLesson[],
  now = new Date(),
): UnifiedTask | null {
  if (lesson.status !== "completed" || !lesson.homework?.trim()) return null;
  const review = effectiveReview(lesson);
  const status = offlineStatus(review);
  if (!status) return null;

  const nextLesson = [...upcomingLessons]
    .filter((candidate) => sameLearningStream(lesson, candidate))
    .sort((left, right) => `${left.date}-${left.startTime ?? ""}`.localeCompare(`${right.date}-${right.startTime ?? ""}`))[0] ?? null;
  const assignedAt = aqtobeIso(lesson.date, lesson.startTime);
  const dueAt = nextLesson ? aqtobeIso(nextLesson.date, nextLesson.startTime) : null;
  const updatedAt = review?.reviewedAt ?? assignedAt ?? now.toISOString();

  return withTaskState({
    id: `offline:${lesson.crmClassId}`,
    source: "offline",
    kind: "assignment",
    title: lesson.topic?.trim() || "Домашнее задание после урока",
    descriptionPreview: descriptionPreview(lesson.homework),
    status,
    context: {
      primary: lesson.groupName?.trim() || lesson.title,
      secondary: "Урок в школе",
      teacherName: lesson.teacherName?.trim() || null,
    },
    timing: {
      assignedAt,
      dueAt,
      dueKind: dueAt ? "next_lesson" : null,
      overdue: false,
    },
    result: {
      completionPercent: review?.completionPercent ?? (status === "completed" ? 100 : null),
      scorePercent: null,
      reviewComment: review?.difficulties || review?.notCompletedReason || null,
      points: lesson.lessonPointsAwarded ?? null,
      coins: null,
    },
    target: {
      href: `/school-lessons?tab=homework&lesson=${encodeURIComponent(lesson.crmClassId)}`,
      actionLabel: taskActionLabel(status, "offline"),
    },
    updatedAt,
  }, now);
}

export async function loadOfflineTasks(studentId: string, now = new Date()) {
  const summary = await getStudentSchoolOfflineSummary(studentId) as unknown as {
    lessonHistory?: OfflineLesson[];
    upcomingLessons?: OfflineLesson[];
  };
  const upcoming = summary.upcomingLessons ?? [];
  return (summary.lessonHistory ?? [])
    .map((lesson) => mapOfflineTask(lesson, upcoming, now))
    .filter((task): task is UnifiedTask => Boolean(task));
}
