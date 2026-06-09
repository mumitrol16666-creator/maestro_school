import type { LessonProgressStatus } from "@prisma/client";
import { ConflictError } from "./errors.js";

/** Terminal and active states for the learning engine */
export const LESSON_PROGRESS_STATUSES = [
  "locked",
  "available",
  "in_progress",
  "submitted",
  "reviewed",
  "completed",
] as const satisfies readonly LessonProgressStatus[];

export type LessonProgressState = LessonProgressStatus;

/** Student-initiated transitions */
const STUDENT_TRANSITIONS: Partial<Record<LessonProgressState, LessonProgressState[]>> = {
  available: ["in_progress"],
  in_progress: ["submitted"],
};

/** System-initiated transitions (unlock, review outcomes) */
const SYSTEM_TRANSITIONS: Partial<Record<LessonProgressState, LessonProgressState[]>> = {
  locked: ["available"],
  submitted: ["reviewed", "completed", "available"],
  reviewed: ["completed", "available"],
};

export function isLessonCompleted(status: LessonProgressState): boolean {
  return status === "completed";
}

export function canStudentTransition(
  from: LessonProgressState,
  to: LessonProgressState,
): boolean {
  return STUDENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canSystemTransition(
  from: LessonProgressState,
  to: LessonProgressState,
): boolean {
  return SYSTEM_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStudentTransition(
  from: LessonProgressState,
  to: LessonProgressState,
): void {
  if (!canStudentTransition(from, to)) {
    throw new ConflictError(
      `Invalid lesson progress transition: ${from} → ${to}`,
      "INVALID_LESSON_TRANSITION",
    );
  }
}

export function assertSystemTransition(
  from: LessonProgressState,
  to: LessonProgressState,
): void {
  if (!canSystemTransition(from, to)) {
    throw new ConflictError(
      `Invalid system lesson transition: ${from} → ${to}`,
      "INVALID_LESSON_TRANSITION",
    );
  }
}

/**
 * Full state machine map for documentation and tests.
 *
 * LOCKED ──(prev completed)──► AVAILABLE
 * AVAILABLE ──(student opens)──► IN_PROGRESS
 * IN_PROGRESS ──(homework sent)──► SUBMITTED
 * SUBMITTED ──(admin reviews)──► REVIEWED
 * REVIEWED ──(approved)──► COMPLETED
 * SUBMITTED|REVIEWED ──(revision)──► AVAILABLE
 */
export const LESSON_STATE_MACHINE = {
  locked: { next: ["available"], actor: "system" },
  available: { next: ["in_progress"], actor: "student" },
  in_progress: { next: ["submitted"], actor: "student" },
  submitted: { next: ["reviewed", "completed", "available"], actor: "admin|system" },
  reviewed: { next: ["completed", "available"], actor: "admin" },
  completed: { next: [], actor: "terminal" },
} as const;
