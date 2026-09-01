import { BadRequestError, ConflictError } from "./errors.js";

export type LearningHomeworkRecipientStateValue =
  | "assigned"
  | "waiting_review"
  | "revision"
  | "accepted"
  | "accepted_with_comment";

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
  if (["accepted", "accepted_with_comment"].includes(input.state)) {
    throw new ConflictError(
      "Домашнее задание уже принято",
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
  decision: "revision" | "accepted" | "accepted_with_comment";
  comment?: string | null;
}) {
  if (input.state !== "waiting_review") {
    throw new ConflictError(
      "У задания нет ответа, ожидающего проверки",
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
    accepted: input.decision !== "revision",
    comment: comment || null,
  } as const;
}
