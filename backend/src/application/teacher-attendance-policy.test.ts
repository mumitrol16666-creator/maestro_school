import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTeacherAttendanceStatus } from "./services/teacher-attendance-policy.js";

test("teacher absence is always unexcused", () => {
  assert.equal(normalizeTeacherAttendanceStatus("unexcused_absence"), "unexcused_absence");
  assert.equal(normalizeTeacherAttendanceStatus("excused_absence"), "unexcused_absence");
  assert.equal(normalizeTeacherAttendanceStatus("emergency_freeze"), "unexcused_absence");
});

test("teacher present, late and unmarked statuses are preserved", () => {
  assert.equal(normalizeTeacherAttendanceStatus("present"), "present");
  assert.equal(normalizeTeacherAttendanceStatus("late"), "late");
  assert.equal(normalizeTeacherAttendanceStatus("unmarked"), "unmarked");
});
