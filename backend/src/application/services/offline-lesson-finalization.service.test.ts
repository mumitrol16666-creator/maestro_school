import assert from "node:assert/strict";
import test from "node:test";
import {
  awardedOfflineLessonAttendanceAmounts,
  offlineLessonAttendanceRewardEligibility,
} from "./offline-lesson-finalization.service.js";

test("V2 attendance finalization reports the XP and Maestro Coins awarded in this call", () => {
  assert.deepEqual(awardedOfflineLessonAttendanceAmounts({
    awarded: true,
    amount: 20,
    coins: 50,
  }), {
    xp: 20,
    coins: 50,
  });
});

test("V2 attendance finalization reports no new rewards for an idempotent replay", () => {
  assert.deepEqual(awardedOfflineLessonAttendanceAmounts({
    awarded: false,
    amount: 20,
    coins: 50,
  }), {
    xp: 0,
    coins: 0,
  });
});

test("legacy attendance awards without a coins field remain compatible", () => {
  assert.deepEqual(awardedOfflineLessonAttendanceAmounts({
    awarded: true,
    amount: 20,
  }), {
    xp: 20,
    coins: 0,
  });
});

test("approved attendance snapshot remains authoritative after mutable checks change", () => {
  const approvalSnapshot = {
    recipientCrmStudentIds: ["student-present-at-submit", "student-late-at-submit"],
  };

  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-present-at-submit",
    attendanceStatus: "absent",
  }, approvalSnapshot), "attended");
  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-late-at-submit",
    attendanceStatus: "unmarked",
  }, approvalSnapshot), "attended");
  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-added-after-submit",
    attendanceStatus: "present",
  }, approvalSnapshot), "ignore");
  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-present-now",
    attendanceStatus: "present",
  }, { recipientCrmStudentIds: [] }), "ignore");
});

test("legacy finalization still uses the live attendance status without a report snapshot", () => {
  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-present",
    attendanceStatus: "present",
  }), "attended");
  assert.equal(offlineLessonAttendanceRewardEligibility({
    crmStudentId: "student-absent",
    attendanceStatus: "absent",
  }), "not_attended");
});
