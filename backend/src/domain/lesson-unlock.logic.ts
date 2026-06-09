import type { LessonProgressStatus } from "@prisma/client";
import { isLessonCompleted } from "./lesson-progress.state-machine.js";

export interface LessonOrderItem {
  id: string;
  sortOrder: number;
}

export function resolveLessonAvailability(
  lessonId: string,
  index: number,
  orderedLessons: LessonOrderItem[],
  progressMap: Map<string, { status: LessonProgressStatus }>,
): LessonProgressStatus {
  const existing = progressMap.get(lessonId);
  if (existing && existing.status !== "locked") {
    return existing.status;
  }

  if (index === 0) return "available";

  const previous = orderedLessons[index - 1];
  const prevProgress = progressMap.get(previous.id);
  if (prevProgress && isLessonCompleted(prevProgress.status)) {
    return "available";
  }

  return "locked";
}

export function findNextLessonId(
  completedLessonId: string,
  orderedLessons: LessonOrderItem[],
): string | null {
  const index = orderedLessons.findIndex((l) => l.id === completedLessonId);
  if (index === -1 || index >= orderedLessons.length - 1) return null;
  return orderedLessons[index + 1].id;
}

export function calculateProgressPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
