import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyPlanSnapshot,
  calculateAggregateMonthlyPlanProgress,
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
  const teacherDraft = {
    goal: "  Ровный ритм ",
    expectedResult: "80 BPM",
    checkpoint: "Контрольная запись",
    note: "Внутренняя заметка",
    items: [{ id: "a", title: "Метроном", status: "completed" }],
  };
  assert.deepEqual(buildMonthlyPlanSnapshot(teacherDraft), {
    schemaVersion: 1,
    goal: "Ровный ритм",
    items: [{ id: "a", title: "Метроном", status: "completed" }],
    progress: { completed: 1, inProgress: 0, total: 1, percent: 100 },
  });
});

test("monthly plan aggregate combines every published plan", () => {
  assert.deepEqual(calculateAggregateMonthlyPlanProgress([
    { items: [{ id: "a", title: "Аккорды", status: "completed" }] },
    { items: [
      { id: "b", title: "Ритм", status: "in_progress" },
      { id: "c", title: "Песня", status: "planned" },
    ] },
  ]), {
    completed: 1,
    total: 3,
    percent: 33,
  });
});
