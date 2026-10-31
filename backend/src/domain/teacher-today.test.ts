import assert from "node:assert/strict";
import test from "node:test";
import {
  aqtobeDateKey,
  aqtobeDateTime,
  birthdayAge,
  daysUntilBirthday,
  lessonPhase,
  lessonsBlockingStart,
  openReport,
  proposalStale,
} from "./teacher-today.js";

// 19 October 2026, 10:30 in Aqtobe.
const now = new Date("2026-10-19T05:30:00.000Z");

test("today is counted in Aqtobe time", () => {
  assert.equal(aqtobeDateKey(now), "2026-10-19");
  assert.equal(aqtobeDateKey(new Date("2026-10-18T19:30:00.000Z")), "2026-10-19", "00:30 local is already the next day");
});

test("a lesson is upcoming, running or ended by its local times", () => {
  assert.equal(lessonPhase({ date: "2026-10-19", startTime: "11:00", endTime: "11:45" }, now), "upcoming");
  assert.equal(lessonPhase({ date: "2026-10-19", startTime: "10:00", endTime: "10:45" }, now), "now");
  assert.equal(lessonPhase({ date: "2026-10-19", startTime: "09:00", endTime: "09:45" }, now), "ended");
});

test("a report is owed once the lesson ended and becomes overdue after a day", () => {
  assert.equal(openReport({ date: "2026-10-19", endTime: "11:45", status: "scheduled" }, now), null, "not ended yet");
  const fresh = openReport({ date: "2026-10-19", endTime: "09:45", status: "started" }, now);
  assert.equal(fresh?.overdue, false);
  const old = openReport({ date: "2026-10-17", endTime: "18:00", status: "not_filled" }, now);
  assert.equal(old?.overdue, true);
  for (const status of ["pending_admin_review", "pending_sync", "completed", "cancelled"]) {
    assert.equal(openReport({ date: "2026-10-17", endTime: "18:00", status }, now), null, `${status} is closed`);
  }
});

test("a proposal is stale after three days", () => {
  assert.equal(proposalStale(new Date("2026-10-17T05:30:00.000Z"), now), false);
  assert.equal(proposalStale(new Date("2026-10-16T05:30:00.000Z"), now), true);
});

test("birthdays within a week, today included, with the age they turn", () => {
  assert.equal(daysUntilBirthday("2012-10-19", now), 0);
  assert.equal(daysUntilBirthday("2012-10-26", now), 7);
  assert.equal(daysUntilBirthday("2012-10-27", now), null, "eight days is outside the window");
  assert.equal(daysUntilBirthday("2012-10-18", now), null, "yesterday is next year");
  assert.equal(daysUntilBirthday(null, now), null);
  assert.equal(birthdayAge("2012-10-19", now, 0), 14);
  // A New Year birthday seen from late December wraps into the next year.
  assert.equal(daysUntilBirthday("2015-01-02", new Date("2026-12-29T05:00:00.000Z")), 4);
});

// 31.10 (Vladislav): a new lesson does not start while an earlier one owes its report.
test("an earlier ended lesson without a sent report blocks the start of the next one", () => {
  const target = { crmClassId: "today", date: "2026-10-19", startTime: "11:00" };
  const lessons = [
    { crmClassId: "today", date: "2026-10-19", startTime: "11:00", endTime: "11:45", status: "scheduled" },
    { crmClassId: "yesterday-open", date: "2026-10-18", startTime: "15:00", endTime: "15:45", status: "started" },
    { crmClassId: "old-not-filled", date: "2026-10-16", startTime: "15:00", endTime: "15:45", status: "not_filled" },
    { crmClassId: "never-started", date: "2026-10-19", startTime: "08:00", endTime: "08:45", status: "scheduled" },
    { crmClassId: "sent", date: "2026-10-18", startTime: "17:00", endTime: "17:45", status: "pending_admin_review" },
    { crmClassId: "approved", date: "2026-10-17", startTime: "17:00", endTime: "17:45", status: "completed" },
    { crmClassId: "cancelled", date: "2026-10-17", startTime: "12:00", endTime: "12:45", status: "cancelled" },
    { crmClassId: "running", date: "2026-10-19", startTime: "10:00", endTime: "10:45", status: "started" },
  ];
  assert.deepEqual(
    lessonsBlockingStart(target, lessons, now).map((lesson) => lesson.crmClassId),
    ["old-not-filled", "yesterday-open", "never-started"],
    "sent, approved, cancelled and still running lessons do not block; the oldest comes first",
  );
});

test("the earliest owed lesson can always be started, so nothing waits on itself", () => {
  const lessons = [
    { crmClassId: "monday", date: "2026-10-12", startTime: "15:00", endTime: "15:45", status: "scheduled" },
    { crmClassId: "wednesday", date: "2026-10-14", startTime: "15:00", endTime: "15:45", status: "scheduled" },
  ];
  assert.deepEqual(lessonsBlockingStart({ crmClassId: "monday", date: "2026-10-12", startTime: "15:00" }, lessons, now), []);
  assert.deepEqual(
    lessonsBlockingStart({ crmClassId: "wednesday", date: "2026-10-14", startTime: "15:00" }, lessons, now)
      .map((lesson) => lesson.crmClassId),
    ["monday"],
  );
});

test("a lesson day stored as a timestamp is the Aqtobe day of that moment", () => {
  assert.equal(aqtobeDateTime("2026-10-18T12:00:00.000Z", "15:00")?.toISOString(), "2026-10-18T10:00:00.000Z");
  assert.equal(aqtobeDateTime("2026-10-18T19:30:00.000Z", "09:00")?.toISOString(), "2026-10-19T04:00:00.000Z");
  assert.equal(aqtobeDateTime("2026-10-18", "09:00")?.toISOString(), "2026-10-18T04:00:00.000Z");
});

test("a report sent from the app closes the lesson before CRM has it; older lessons fall out of the window", () => {
  const target = { crmClassId: "today", date: "2026-10-19", startTime: "11:00" };
  const lessons = [
    { crmClassId: "sent-locally", date: "2026-10-18", startTime: "15:00", endTime: "15:45", status: "started" },
    { crmClassId: "two-weeks-old", date: "2026-10-05", startTime: "15:00", endTime: "15:45", status: "not_filled" },
    { crmClassId: "open", date: "2026-10-18", startTime: "17:00", endTime: "17:45", status: "started" },
  ];
  assert.deepEqual(
    lessonsBlockingStart(target, lessons, now, { sentCrmClassIds: new Set(["sent-locally"]) })
      .map((lesson) => lesson.crmClassId),
    ["open"],
  );
});
