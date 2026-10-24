import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const { offlineLessonStartsAt } = await import("./teacher-offline.service.js");

// Plan 1.14 / audit 24.10: «Отменить урок» waits for the lesson time, counted in Aqtobe.
test("the lesson start is its Aqtobe day plus the start time, whatever time CRM stored in the date", () => {
  assert.equal(offlineLessonStartsAt("2026-10-22T07:00:00.000Z", "10:00").toISOString(), "2026-10-22T05:00:00.000Z");
  assert.equal(offlineLessonStartsAt("2026-10-22T19:30:00.000Z", "09:15").toISOString(), "2026-10-23T04:15:00.000Z", "evening UTC is already the next Aqtobe day");
  assert.equal(offlineLessonStartsAt(new Date("2026-10-22T00:00:00.000Z"), "18:00").toISOString(), "2026-10-22T13:00:00.000Z");
});
