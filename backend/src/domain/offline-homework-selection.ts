/**
 * Pure domain logic for selecting the active & reviewed offline homeworks.
 * Deliberately free of infrastructure imports (prisma, env, CRM client)
 * so that unit tests can run without DATABASE_URL / JWT_SECRET.
 */

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
