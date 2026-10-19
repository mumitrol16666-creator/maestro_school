import assert from "node:assert/strict";
import test from "node:test";
import {
  aqtobeDateKey,
  birthdayAge,
  daysUntilBirthday,
  lessonPhase,
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
