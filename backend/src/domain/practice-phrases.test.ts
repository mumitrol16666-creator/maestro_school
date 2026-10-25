import assert from "node:assert/strict";
import test from "node:test";
import { pickPhrase, PRACTICE_REMINDER_PHRASES } from "./practice-phrases.js";

test("a day's phrase is stable for the student and never repeats yesterday's", () => {
  const today = pickPhrase(PRACTICE_REMINDER_PHRASES, "2026-10-25", "student-1");
  assert.equal(pickPhrase(PRACTICE_REMINDER_PHRASES, "2026-10-25", "student-1"), today, "same day, same line");
  const tomorrow = pickPhrase(PRACTICE_REMINDER_PHRASES, "2026-10-26", "student-1", today);
  assert.notEqual(tomorrow, today);
  assert.equal(pickPhrase(["одна"], "2026-10-26", "s", "одна"), "одна", "one phrase is allowed to repeat");
});
