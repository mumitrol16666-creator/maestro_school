import assert from "node:assert/strict";
import test from "node:test";
import { listPreparedTestTemplates } from "../../../domain/prepared-tests.js";
import { mapTheoryTasks } from "./theory-task.adapter.js";

const templates = listPreparedTestTemplates().slice(0, 3);
const [first, second, third] = templates.map((template) => template.id);
const now = new Date("2026-10-20T10:00:00+05:00");

test("plan 2.3: the first test not passed is the current theory task", () => {
  const tasks = mapTheoryTasks(templates, [], now);
  assert.deepEqual(tasks.map((task) => [task.id, task.status]), [[`theory:${first}`, "todo"]]);
  assert.equal(tasks[0]?.source, "theory");
  assert.equal(tasks[0]?.target.href, `/tests/${first}`);
});

test("passed tests are completed tasks with the best score; the next one is current", () => {
  const tasks = mapTheoryTasks(templates, [
    { testId: first!, score: 90, passed: true, createdAt: new Date("2026-10-18T10:00:00+05:00") },
  ], now);
  assert.deepEqual(tasks.map((task) => [task.id, task.status]), [[`theory:${second}`, "todo"], [`theory:${first}`, "completed"]]);
  assert.equal(tasks[1]?.result.scorePercent, 90);
});

test("a test failed today with an attempt left is the one to retry; any order is allowed", () => {
  const tasks = mapTheoryTasks(templates, [
    { testId: third!, score: 40, passed: false, createdAt: new Date("2026-10-20T09:00:00+05:00") },
  ], now);
  assert.deepEqual(tasks.map((task) => [task.id, task.status, task.target.actionLabel]), [[`theory:${third}`, "needs_revision", "Повторить тест"]]);
});

test("after today's test is passed or its attempts are used, nothing new until tomorrow", () => {
  const passedToday = mapTheoryTasks(templates, [
    { testId: first!, score: 80, passed: true, createdAt: new Date("2026-10-20T09:00:00+05:00") },
  ], now);
  assert.deepEqual(passedToday.map((task) => task.status), ["completed"]);
  const usedUp = mapTheoryTasks(templates, [
    { testId: first!, score: 40, passed: false, createdAt: new Date("2026-10-20T08:00:00+05:00") },
    { testId: first!, score: 50, passed: false, createdAt: new Date("2026-10-20T09:00:00+05:00") },
  ], now);
  assert.deepEqual(usedUp, []);
});
