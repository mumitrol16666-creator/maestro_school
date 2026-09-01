import assert from "node:assert/strict";
import test from "node:test";
import {
  learningHomeworkReviewTransition,
  nextLearningHomeworkAttempt,
  validateLearningHomeworkSubmission,
} from "./learning-homework-flow.js";

test("ready_for_lesson may be empty or include an optional note and materials", () => {
  assert.doesNotThrow(() => validateLearningHomeworkSubmission({
    mode: "ready_for_lesson",
    materialCount: 0,
  }));
  assert.doesNotThrow(() => validateLearningHomeworkSubmission({
    mode: "ready_for_lesson",
    text: "Проверить переход на уроке",
    materialCount: 1,
  }));
  assert.throws(
    () => validateLearningHomeworkSubmission({ mode: "materials", materialCount: 0 }),
    (error: { code?: string }) => error.code === "HOMEWORK_MATERIALS_REQUIRED",
  );
});

test("a newer version before review stays in the same submission cycle", () => {
  assert.deepEqual(nextLearningHomeworkAttempt({
    state: "waiting_review",
    currentCycle: 1,
    latestAttempt: {
      id: "attempt-1",
      attemptNumber: 1,
      cycleNumber: 1,
      versionInCycle: 1,
    },
    previousAttemptId: "attempt-1",
  }), {
    attemptNumber: 2,
    cycleNumber: 1,
    versionInCycle: 2,
    supersedeAttemptId: "attempt-1",
  });
});

test("revision starts the next cycle without overwriting the previous attempt", () => {
  const review = learningHomeworkReviewTransition({
    state: "waiting_review",
    currentCycle: 1,
    decision: "revision",
    comment: "Повторить переход",
  });
  assert.equal(review.currentCycle, 2);
  assert.equal(review.accepted, false);

  assert.deepEqual(nextLearningHomeworkAttempt({
    state: "revision",
    currentCycle: review.currentCycle,
    latestAttempt: {
      id: "attempt-1",
      attemptNumber: 1,
      cycleNumber: 1,
      versionInCycle: 1,
    },
    previousAttemptId: "attempt-1",
  }), {
    attemptNumber: 2,
    cycleNumber: 2,
    versionInCycle: 1,
    supersedeAttemptId: null,
  });
});

test("revision and accepted_with_comment require a teacher comment", () => {
  for (const decision of ["revision", "accepted_with_comment"] as const) {
    assert.throws(
      () => learningHomeworkReviewTransition({
        state: "waiting_review",
        currentCycle: 1,
        decision,
      }),
      (error: { code?: string }) => error.code === "HOMEWORK_REVIEW_COMMENT_REQUIRED",
    );
  }
});

test("accepted recipient cannot submit another attempt", () => {
  assert.throws(
    () => nextLearningHomeworkAttempt({
      state: "accepted",
      currentCycle: 1,
      latestAttempt: {
        id: "attempt-1",
        attemptNumber: 1,
        cycleNumber: 1,
        versionInCycle: 1,
      },
      previousAttemptId: "attempt-1",
    }),
    (error: { code?: string }) => error.code === "HOMEWORK_ALREADY_ACCEPTED",
  );
});
