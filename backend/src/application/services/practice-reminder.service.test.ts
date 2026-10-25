import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const { practiceStreakDays } = await import("./practice-reminder.service.js");

test("the practice streak counts consecutive days up to today, or yesterday when today is not marked", () => {
  assert.equal(practiceStreakDays(["2026-10-25", "2026-10-24", "2026-10-23", "2026-10-20"], "2026-10-25"), 3);
  assert.equal(practiceStreakDays(["2026-10-24", "2026-10-23"], "2026-10-25"), 2, "today not marked yet keeps yesterday's streak");
  assert.equal(practiceStreakDays(["2026-10-20"], "2026-10-25"), 0);
  assert.equal(practiceStreakDays([], "2026-10-25"), 0);
});
