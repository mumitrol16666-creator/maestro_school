import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const { practiceReminderDue } = await import("./practice-reminder-job.service.js");

const reminder = { enabled: true, time: "18:00", days: [1, 2, 3, 4, 5], lastSentAt: null };
const monday1805 = new Date("2026-10-26T13:05:00.000Z"); // Monday 18:05 in Aqtobe

test("the practice reminder fires once a day at its time, on chosen days, when there is no lesson and no check-in", () => {
  assert.equal(practiceReminderDue({ reminder, now: monday1805, lessonToday: false, checkedInToday: false }), true);
  assert.equal(practiceReminderDue({ reminder, now: new Date("2026-10-26T12:50:00.000Z"), lessonToday: false, checkedInToday: false }), false, "17:50 is too early");
  assert.equal(practiceReminderDue({ reminder, now: monday1805, lessonToday: true, checkedInToday: false }), false, "a lesson day needs no reminder");
  assert.equal(practiceReminderDue({ reminder, now: monday1805, lessonToday: false, checkedInToday: true }), false, "already practised");
  assert.equal(practiceReminderDue({ reminder: { ...reminder, lastSentAt: new Date("2026-10-26T13:00:00.000Z") }, now: monday1805, lessonToday: false, checkedInToday: false }), false, "sent today");
  assert.equal(practiceReminderDue({ reminder: { ...reminder, lastSentAt: new Date("2026-10-25T13:00:00.000Z") }, now: monday1805, lessonToday: false, checkedInToday: false }), true, "yesterday's send does not block");
  assert.equal(practiceReminderDue({ reminder, now: new Date("2026-10-25T13:05:00.000Z"), lessonToday: false, checkedInToday: false }), false, "Sunday is not chosen");
  assert.equal(practiceReminderDue({ reminder: { ...reminder, enabled: false }, now: monday1805, lessonToday: false, checkedInToday: false }), false);
});
