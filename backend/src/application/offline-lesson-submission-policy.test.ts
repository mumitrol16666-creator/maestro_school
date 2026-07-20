import assert from "node:assert/strict";
import test from "node:test";
import { validateOfflineLessonSubmission } from "./services/offline-lesson-submission-policy.js";

const heldStudent = {
  name: "Ученик",
  attendanceStatus: "present",
  homeworkReview: { status: "completed" },
};

test("rejects a held lesson without topic and summary", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "individual", group: null },
    students: [heldStudent],
    payload: {},
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "LESSON_TOPIC_REQUIRED");
});

test("rejects submission until every student has attendance", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "group", group: { name: "Группа" } },
    students: [
      heldStudent,
      { name: "Второй ученик", attendanceStatus: "unmarked" },
    ],
    payload: {
      topic: "Аккорды",
      lessonSummary: "Разобрали упражнение",
    },
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "LESSON_ATTENDANCE_INCOMPLETE");
});

test("all absent students create an attendance-only result", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "individual", group: null },
    students: [
      { name: "Ученик", attendanceStatus: "unexcused_absence" },
    ],
    payload: {},
  });

  assert.deepEqual(result, {
    valid: true,
    outcome: "no_submission",
    requiresReport: false,
  });
});

test("individual held lesson requires previous homework review", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "individual", group: null },
    students: [{
      name: "Ученик",
      attendanceStatus: "present",
      homeworkReview: { status: "not_checked" },
    }],
    payload: {
      topic: "Аккорды",
      lessonSummary: "Разобрали упражнение",
    },
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "LESSON_HOMEWORK_REVIEW_REQUIRED");
});
