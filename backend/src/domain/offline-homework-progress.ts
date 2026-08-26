export type OfflineHomeworkStatus =
  | "not_checked"
  | "completed"
  | "partial"
  | "not_completed"
  | "not_assigned";

export type OfflineHomeworkLessonRef = {
  crmClassId: string;
  date: string;
  startTime?: string | null;
  homework?: string | null;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
};

export type OfflineHomeworkReviewRef = {
  crmClassId: string;
  sourceCrmClassId?: string | null;
  status: string;
  completionPercent?: number | null;
  reviewedAt?: Date | null;
};

export type OfflineHomeworkResult = {
  status: Exclude<OfflineHomeworkStatus, "not_checked" | "not_assigned">;
  completionPercent: number | null;
  reviewedAt: string | null;
  reviewConfidence: "exact" | "legacy_derived";
};

function lessonOrder(lesson: OfflineHomeworkLessonRef) {
  return `${lesson.date.slice(0, 10)}T${lesson.startTime?.slice(0, 5) || "00:00"}`;
}

function normalized(value?: string | null) {
  return value?.trim().toLocaleLowerCase("ru-RU") || "";
}

function isSameLearningTrack(
  assignedLesson: OfflineHomeworkLessonRef,
  reviewLesson: OfflineHomeworkLessonRef,
) {
  if (assignedLesson.crmGroupId && reviewLesson.crmGroupId) {
    return assignedLesson.crmGroupId === reviewLesson.crmGroupId;
  }
  const assignedGroup = normalized(assignedLesson.groupName);
  const reviewGroup = normalized(reviewLesson.groupName);
  if (assignedGroup && reviewGroup) return assignedGroup === reviewGroup;

  if (assignedLesson.crmTeacherId && reviewLesson.crmTeacherId) {
    return assignedLesson.crmTeacherId === reviewLesson.crmTeacherId;
  }

  const assignedTeacher = normalized(assignedLesson.teacherName);
  const reviewTeacher = normalized(reviewLesson.teacherName);
  if (assignedTeacher && reviewTeacher) return assignedTeacher === reviewTeacher;

  return true;
}

function normalizeReview(
  review: OfflineHomeworkReviewRef,
  reviewConfidence: OfflineHomeworkResult["reviewConfidence"],
): OfflineHomeworkResult | null {
  if (!["completed", "partial", "not_completed"].includes(review.status)) return null;

  const status = review.status as OfflineHomeworkResult["status"];
  const fallback = status === "completed" ? 100 : status === "not_completed" ? 0 : null;
  const rawPercent = review.completionPercent ?? fallback;
  const completionPercent = rawPercent == null
    ? null
    : Math.max(0, Math.min(100, Math.round(rawPercent)));

  return {
    status,
    completionPercent,
    reviewedAt: review.reviewedAt?.toISOString() ?? null,
    reviewConfidence,
  };
}

/**
 * A teacher evaluates the previous homework while closing the current lesson.
 * Link that review to the latest earlier lesson that actually assigned homework.
 */
export function linkOfflineHomeworkResults(
  lessons: OfflineHomeworkLessonRef[],
  reviews: OfflineHomeworkReviewRef[],
) {
  const lessonsByClassId = new Map(lessons.map((lesson) => [lesson.crmClassId, lesson]));
  const chronological = [...lessons].sort((left, right) =>
    lessonOrder(left).localeCompare(lessonOrder(right)));
  const resultByAssignedClassId = new Map<string, OfflineHomeworkResult>();

  const orderedReviews = reviews
    .map((review) => ({
      review,
      lesson: lessonsByClassId.get(review.crmClassId),
      normalized: normalizeReview(review, review.sourceCrmClassId ? "exact" : "legacy_derived"),
    }))
    .filter((item): item is typeof item & {
      lesson: OfflineHomeworkLessonRef;
      normalized: OfflineHomeworkResult;
    } => Boolean(item.lesson && item.normalized))
    .sort((left, right) => lessonOrder(left.lesson).localeCompare(lessonOrder(right.lesson)));

  for (const item of orderedReviews.filter(({ review }) => Boolean(review.sourceCrmClassId))) {
    const assignedLesson = lessonsByClassId.get(item.review.sourceCrmClassId as string);
    if (
      assignedLesson
      && lessonOrder(assignedLesson) < lessonOrder(item.lesson)
      && Boolean(assignedLesson.homework?.trim())
    ) {
      resultByAssignedClassId.set(assignedLesson.crmClassId, item.normalized);
    }
  }

  for (const item of orderedReviews.filter(({ review }) => !review.sourceCrmClassId)) {
    const reviewOrder = lessonOrder(item.lesson);
    const assignedLesson = [...chronological]
      .reverse()
      .find((lesson) => (
        lessonOrder(lesson) < reviewOrder
        && Boolean(lesson.homework?.trim())
        && !resultByAssignedClassId.has(lesson.crmClassId)
        && isSameLearningTrack(lesson, item.lesson)
      ));

    if (assignedLesson) {
      resultByAssignedClassId.set(assignedLesson.crmClassId, item.normalized);
    }
  }

  return resultByAssignedClassId;
}
