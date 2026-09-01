import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../domain/errors.js";
import {
  assertExpectedLearningPlanVersion,
  learningTopicStatus,
  validateOutsideLessonTopicProgress,
} from "./learning-plan-v2.service.js";

function expectAppError(code: string, action: () => void) {
  assert.throws(action, (error: unknown) => (
    error instanceof AppError && error.code === code
  ));
}

test("learning topic status is derived from the numeric source of truth", () => {
  assert.equal(learningTopicStatus(0), "planned");
  assert.equal(learningTopicStatus(null), "in_progress");
  assert.equal(learningTopicStatus(1), "in_progress");
  assert.equal(learningTopicStatus(99), "in_progress");
  assert.equal(learningTopicStatus(100), "completed");
});

test("plan writes require the current optimistic version", () => {
  assert.doesNotThrow(() => assertExpectedLearningPlanVersion(3, 3));
  expectAppError(
    "MONTHLY_PLAN_EXPECTED_VERSION_REQUIRED",
    () => assertExpectedLearningPlanVersion(3, undefined),
  );
  expectAppError(
    "MONTHLY_PLAN_STALE_DRAFT",
    () => assertExpectedLearningPlanVersion(3, 2),
  );
});

test("outside a lesson a teacher can set only 0-99 percent", () => {
  assert.doesNotThrow(() => validateOutsideLessonTopicProgress({
    currentPercent: 40,
    expectedPercent: 40,
    toPercent: 99,
  }));
  expectAppError(
    "LEARNING_TOPIC_100_REQUIRES_LESSON",
    () => validateOutsideLessonTopicProgress({
      currentPercent: 99,
      expectedPercent: 99,
      toPercent: 100,
    }),
  );
  expectAppError(
    "LEARNING_TOPIC_MASTERED_LOCKED",
    () => validateOutsideLessonTopicProgress({
      currentPercent: 100,
      expectedPercent: 100,
      toPercent: 90,
    }),
  );
  expectAppError(
    "LEARNING_TOPIC_STALE_PROGRESS",
    () => validateOutsideLessonTopicProgress({
      currentPercent: 50,
      expectedPercent: 40,
      toPercent: 60,
    }),
  );
  expectAppError(
    "LEARNING_TOPIC_PROGRESS_INVALID",
    () => validateOutsideLessonTopicProgress({
      currentPercent: 50,
      expectedPercent: 50,
      toPercent: 101,
    }),
  );
});
