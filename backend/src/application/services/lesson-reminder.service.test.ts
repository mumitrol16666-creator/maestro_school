import assert from "node:assert/strict";
import test from "node:test";
import {
  dueLessonReminderRules,
  parseAqtobeLessonStart,
} from "./lesson-reminder.logic.js";

test("parses CRM calendar date in the school time zone", () => {
  const startsAt = parseAqtobeLessonStart("2026-07-24T00:00:00.000Z", "18:30");
  assert.equal(startsAt?.toISOString(), "2026-07-24T13:30:00.000Z");
});

test("selects only the teacher 30 minute checkpoint", () => {
  const now = new Date("2026-07-24T13:00:00.000Z");
  const startsAt = new Date("2026-07-24T13:29:00.000Z");
  assert.deepEqual(
    dueLessonReminderRules(startsAt, "teacher", now).map((rule) => rule.key),
    ["teacher-30m"],
  );
});

test("selects only the teacher 5 minute checkpoint", () => {
  const now = new Date("2026-07-24T13:25:00.000Z");
  const startsAt = new Date("2026-07-24T13:29:00.000Z");
  assert.deepEqual(
    dueLessonReminderRules(startsAt, "teacher", now).map((rule) => rule.key),
    ["teacher-5m"],
  );
});

test("selects student checkpoints independently from teacher checkpoints", () => {
  const startsAt = new Date("2026-07-25T13:00:00.000Z");
  assert.deepEqual(
    dueLessonReminderRules(startsAt, "student", new Date("2026-07-24T13:01:00.000Z"))
      .map((rule) => rule.key),
    ["student-24h"],
  );
  assert.deepEqual(
    dueLessonReminderRules(startsAt, "student", new Date("2026-07-25T11:01:00.000Z"))
      .map((rule) => rule.key),
    ["student-2h"],
  );
});

test("does not send a reminder after the lesson has started", () => {
  const startsAt = new Date("2026-07-24T13:00:00.000Z");
  assert.deepEqual(
    dueLessonReminderRules(startsAt, "student", new Date("2026-07-24T13:01:00.000Z")),
    [],
  );
});
