import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyPlanSnapshot,
  calculateMonthlyPlanProgress,
  normalizeMonthlyPlanItems,
} from "./monthly-plan.js";

test("monthly plan normalizes legacy moved status and duplicate ids", () => {
  assert.deepEqual(normalizeMonthlyPlanItems([
    { id: "a", title: "  Аккорды ", status: "moved" },
    { id: "a", title: "Дубликат", status: "completed" },
    { id: "b", title: "Ритм", status: "in_progress" },
  ]), [
    { id: "a", title: "Аккорды", status: "planned" },
    { id: "b", title: "Ритм", status: "in_progress" },
  ]);
});

test("monthly plan progress counts only mastered topics", () => {
  assert.deepEqual(calculateMonthlyPlanProgress([
    { id: "a", title: "A", status: "completed" },
    { id: "b", title: "B", status: "in_progress" },
    { id: "c", title: "C", status: "planned" },
  ]), { completed: 1, inProgress: 1, total: 3, percent: 33 });
});

test("monthly plan snapshot exposes only student-facing fields", () => {
  assert.deepEqual(buildMonthlyPlanSnapshot({
    goal: "  Ровный ритм ",
    expectedResult: "80 BPM",
    checkpoint: "Контрольная запись",
    items: [{ id: "a", title: "Метроном", status: "completed" }],
  }), {
    schemaVersion: 1,
    goal: "Ровный ритм",
    expectedResult: "80 BPM",
    checkpoint: "Контрольная запись",
    items: [{ id: "a", title: "Метроном", status: "completed" }],
    progress: { completed: 1, inProgress: 0, total: 1, percent: 100 },
  });
});
