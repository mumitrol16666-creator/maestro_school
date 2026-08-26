type SchoolLessonRef = {
  crmClassId: string;
  date: string;
  startTime?: string | null;
  status?: string | null;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  homeworkResult?: unknown;
};

export type SchoolHomeworkReviewState = "reviewed" | "next_lesson" | "missing_review";

function normalized(value?: string | null) {
  return value?.trim().toLocaleLowerCase("ru-RU") || "";
}

function lessonOrder(lesson: SchoolLessonRef) {
  return `${lesson.date.slice(0, 10)}T${lesson.startTime?.slice(0, 5) || "00:00"}`;
}

function sameLearningStream(left: SchoolLessonRef, right: SchoolLessonRef) {
  if (left.crmGroupId && right.crmGroupId) return left.crmGroupId === right.crmGroupId;
  if (left.groupName && right.groupName) return normalized(left.groupName) === normalized(right.groupName);
  if (left.crmTeacherId && right.crmTeacherId) return left.crmTeacherId === right.crmTeacherId;
  return Boolean(normalized(left.teacherName) && normalized(left.teacherName) === normalized(right.teacherName));
}

export function schoolHomeworkReviewState(
  lesson: SchoolLessonRef,
  lessonHistory: SchoolLessonRef[],
): SchoolHomeworkReviewState {
  if (lesson.homeworkResult) return "reviewed";

  const currentOrder = lessonOrder(lesson);
  const hasLaterCompletedLesson = lessonHistory.some((candidate) => (
    candidate.crmClassId !== lesson.crmClassId
    && candidate.status === "completed"
    && lessonOrder(candidate) > currentOrder
    && sameLearningStream(lesson, candidate)
  ));

  return hasLaterCompletedLesson ? "missing_review" : "next_lesson";
}
