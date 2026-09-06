import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineLessonApprovalSnapshot } from "./offline-lesson-approval-snapshot.js";

test("approval snapshot freezes the report-version author and attended recipients", () => {
  const version = {
    version: 7,
    authorUserId: "teacher-who-submitted-v7",
    attendancePayload: [
      { crmStudentId: "student-present", attendanceStatus: "present" },
      { crmStudentId: "student-absent", attendanceStatus: "absent" },
      { crmStudentId: "student-late", attendanceStatus: "late" },
      { crmStudentId: "student-present", attendanceStatus: "present" },
    ],
  };

  const snapshot = buildOfflineLessonApprovalSnapshot(version);

  assert.deepEqual(snapshot, {
    reportVersion: 7,
    createdByUserId: "teacher-who-submitted-v7",
    recipientCrmStudentIds: ["student-late", "student-present"],
  });

  version.authorUserId = "later-editor";
  version.attendancePayload = [{ crmStudentId: "different-student", attendanceStatus: "present" }];
  assert.deepEqual(snapshot, {
    reportVersion: 7,
    createdByUserId: "teacher-who-submitted-v7",
    recipientCrmStudentIds: ["student-late", "student-present"],
  });
});

test("approval snapshot rejects a malformed immutable attendance payload", () => {
  assert.throws(
    () => buildOfflineLessonApprovalSnapshot({
      version: 2,
      authorUserId: "teacher",
      attendancePayload: [{ attendanceStatus: "present" }],
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_INVALID");
      return true;
    },
  );
});
