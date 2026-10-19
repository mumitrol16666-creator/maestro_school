import { BadRequestError, ConflictError } from "./errors.js";

export type LearningHomeworkRecipientStateValue =
  | "assigned"
  | "waiting_review"
  | "revision"
  | "accepted"
  | "accepted_with_comment"
  | "not_completed";

export type LearningHomeworkReviewDecisionValue =
  | "revision"
  | "accepted"
  | "accepted_with_comment"
  | "not_completed";

/**
 * The teacher checks homework at the lesson and writes down how much of it
 * was done. 0 closes the homework as «не выполнено» (no retake), anything
 * above 0 accepts it; a comment is welcome but never required.
 */
export function learningHomeworkDecisionForPercent(percent: number): LearningHomeworkReviewDecisionValue {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new BadRequestError(
      "Процент выполнения домашнего задания должен быть целым числом от 0 до 100",
      "HOMEWORK_COMPLETION_PERCENT_INVALID",
    );
  }
  return percent === 0 ? "not_completed" : "accepted";
}

/** Tone of a completion percent for the interface: green from 80, orange from 50, red below. */
export function homeworkCompletionTone(percent: number) {
  if (percent >= 80) return "green" as const;
  if (percent >= 50) return "orange" as const;
  if (percent > 0) return "dark_orange" as const;
  return "red" as const;
}

export type LearningHomeworkSubmissionModeValue = "materials" | "ready_for_lesson";

export type LatestHomeworkAttempt = {
  id: string;
  attemptNumber: number;
  cycleNumber: number;
  versionInCycle: number;
};

export function validateLearningHomeworkSubmission(input: {
  mode: LearningHomeworkSubmissionModeValue;
  text?: string | null;
  materialCount: number;
}) {
  const hasText = Boolean(input.text?.trim());
  if (input.mode === "materials" && !hasText && input.materialCount === 0) {
    throw new BadRequestError(
      "Добавьте текст или материал к ответу",
      "HOMEWORK_MATERIALS_REQUIRED",
    );
  }
}

export function nextLearningHomeworkAttempt(input: {
  state: LearningHomeworkRecipientStateValue;
  currentCycle: number;
  latestAttempt: LatestHomeworkAttempt | null;
  previousAttemptId?: string | null;
}) {
  if (["accepted", "accepted_with_comment", "not_completed"].includes(input.state)) {
    throw new ConflictError(
      "Домашнее задание уже проверено преподавателем",
      "HOMEWORK_ALREADY_ACCEPTED",
    );
  }

  if (!input.latestAttempt) {
    if (input.previousAttemptId) {
      throw new ConflictError(
        "Предыдущая версия ответа не найдена",
        "HOMEWORK_PREVIOUS_ATTEMPT_MISMATCH",
      );
    }
    return {
      attemptNumber: 1,
      cycleNumber: input.currentCycle,
      versionInCycle: 1,
      supersedeAttemptId: null,
    };
  }

  if (input.previousAttemptId !== input.latestAttempt.id) {
    throw new ConflictError(
      "Ответ уже изменился. Обновите задание перед повторной отправкой.",
      "HOMEWORK_PREVIOUS_ATTEMPT_MISMATCH",
    );
  }

  const sameCycle = input.latestAttempt.cycleNumber === input.currentCycle;
  return {
    attemptNumber: input.latestAttempt.attemptNumber + 1,
    cycleNumber: input.currentCycle,
    versionInCycle: sameCycle ? input.latestAttempt.versionInCycle + 1 : 1,
    supersedeAttemptId: input.state === "waiting_review" && sameCycle
      ? input.latestAttempt.id
      : null,
  };
}

export function learningHomeworkReviewTransition(input: {
  state: LearningHomeworkRecipientStateValue;
  currentCycle: number;
  decision: LearningHomeworkReviewDecisionValue;
  comment?: string | null;
  /** A check at the lesson needs no submitted answer: any open homework may be decided. */
  checkedAtLesson?: boolean;
}) {
  const openStates: LearningHomeworkRecipientStateValue[] = input.checkedAtLesson
    ? ["assigned", "waiting_review", "revision"]
    : ["waiting_review"];
  if (!openStates.includes(input.state)) {
    throw new ConflictError(
      input.checkedAtLesson && ["accepted", "accepted_with_comment", "not_completed"].includes(input.state)
        ? "Домашнее задание уже проверено"
        : "У задания нет ответа, ожидающего проверки",
      "HOMEWORK_NOT_WAITING_REVIEW",
    );
  }
  const comment = input.comment?.trim() ?? "";
  if (["revision", "accepted_with_comment"].includes(input.decision) && !comment) {
    throw new BadRequestError(
      "Добавьте комментарий преподавателя",
      "HOMEWORK_REVIEW_COMMENT_REQUIRED",
    );
  }
  return {
    recipientState: input.decision,
    attemptStatus: input.decision,
    currentCycle: input.decision === "revision" ? input.currentCycle + 1 : input.currentCycle,
    // «Не выполнено» closes the homework as well, but without XP.
    accepted: input.decision === "accepted" || input.decision === "accepted_with_comment",
    closed: input.decision !== "revision",
    comment: comment || null,
  } as const;
}
