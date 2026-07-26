import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HomeworkTestQuestion } from "./homework-test.js";
import {
  bestPreparedTestScore,
  buildPreparedTestReview,
  isPreparedTestUnlocked,
  shufflePreparedTestOptions,
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

  it("returns every answer with the selected and correct option", () => {
    const incorrect = buildPreparedTestReview(questions, { q1: "b" })[0];
    const correct = buildPreparedTestReview(questions, { q1: "a" })[0];
    assert.equal(incorrect?.isCorrect, false);
    assert.equal(incorrect?.selectedOptionText, "Неверно");
    assert.equal(incorrect?.correctOptionText, "Верно");
    assert.equal(correct?.isCorrect, true);
    assert.equal(correct?.selectedOptionText, "Верно");
  });

  it("shuffles option display without changing ids or the source questions", () => {
    const source = [{
      ...questions[0],
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
        { id: "d", text: "D" },
      ],
    }];
    const first = shufflePreparedTestOptions(source, "student:test:1");
    const repeated = shufflePreparedTestOptions(source, "student:test:1");
    const nextAttempt = shufflePreparedTestOptions(source, "student:test:2");
    assert.deepEqual(first, repeated);
    assert.deepEqual(new Set(first[0]?.options.map((option) => option.id)), new Set(["a", "b", "c", "d"]));
    assert.notDeepEqual(first[0]?.options, nextAttempt[0]?.options);
    assert.equal(source[0]?.options[0]?.id, "a");
  });
});
