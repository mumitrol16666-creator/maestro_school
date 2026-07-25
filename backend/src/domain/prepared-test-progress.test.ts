import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HomeworkTestQuestion } from "./homework-test.js";
import {
  bestPreparedTestScore,
  buildPreparedTestReview,
  isPreparedTestUnlocked,
  validatePreparedTestDraft,
} from "./prepared-test-progress.js";

const attempts = [
  { testId: "one", score: 60, passed: false, createdAt: new Date("2026-01-01") },
  { testId: "one", score: 80, passed: true, createdAt: new Date("2026-01-02") },
];

const questions: HomeworkTestQuestion[] = [{
  id: "q1",
  prompt: "Вопрос",
  correctOptionId: "a",
  options: [{ id: "a", text: "Верно" }, { id: "b", text: "Неверно" }],
}];

describe("prepared test progress", () => {
  it("unlocks tests only after every previous test is passed", () => {
    assert.equal(isPreparedTestUnlocked(1, ["one", "two"], attempts), true);
    assert.equal(isPreparedTestUnlocked(2, ["one", "two", "three"], attempts), false);
  });

  it("keeps the best score across attempts", () => {
    assert.equal(bestPreparedTestScore(attempts, "one"), 80);
    assert.equal(bestPreparedTestScore(attempts, "two"), null);
  });

  it("validates partial drafts without requiring every answer", () => {
    assert.doesNotThrow(() => validatePreparedTestDraft(questions, {}, 0));
    assert.throws(() => validatePreparedTestDraft(questions, { q1: "missing" }, 0));
  });

  it("reveals correct answers only when requested", () => {
    assert.equal(buildPreparedTestReview(questions, { q1: "b" }, false)[0]?.correctOptionText, null);
    assert.equal(buildPreparedTestReview(questions, { q1: "b" }, true)[0]?.correctOptionText, "Верно");
  });
});
