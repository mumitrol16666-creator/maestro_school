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

test("group held lesson requires homework review for every present student", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "group", group: { name: "Группа" } },
    students: [
      heldStudent,
      {
        name: "Второй ученик",
        attendanceStatus: "present",
        homeworkReview: { status: "not_checked" },
      },
    ],
    payload: {
      topic: "Аккорды",
      lessonSummary: "Разобрали упражнение",
    },
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "LESSON_HOMEWORK_REVIEW_REQUIRED");
});

test("learning v2 lesson does not require the legacy homework review field", () => {
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
    requiresLegacyHomeworkReview: false,
  });

  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.outcome, "held");
});

test("trial lead from a booking can submit without a student card", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "trial", group: null },
    students: [{
      name: "Клиент из заявки",
      attendanceStatus: "present",
    }],
    payload: {
      trialReport: {
        teacherAssessment: { interestLevel: 4, contactLevel: 4 },
        lessonFacts: { whatWasTested: "Ритм", whatWorkedWell: "Включился в задания" },
      },
    },
  });

  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.outcome, "held");
});

// 03.11 (document 23 §8): the v3 trial report — four diagnostic blocks and «навык, трудность, действие».
test("a v3 trial report needs a level in every diagnostic block and the three lines for the family", () => {
  const base = {
    lesson: { classType: "trial", group: null },
    students: [{ name: "Клиент из заявки", attendanceStatus: "present" }],
  };
  const complete = {
    version: 3,
    diagnostics: {
      instrument: { level: "independent" },
      hearingPulse: { level: "with_hint" },
      movement: { level: "not_yet" },
      learnability: { level: "independent" },
    },
    lessonFacts: { achieved: "Чистый звук", difficulty: "Устаёт рука", homeAction: "Пять минут звук" },
  };
  const ok = validateOfflineLessonSubmission({ ...base, payload: { trialReport: complete } });
  assert.equal(ok.valid, true);

  const noLevel = validateOfflineLessonSubmission({
    ...base,
    payload: { trialReport: { ...complete, diagnostics: { ...complete.diagnostics, movement: { level: "5" } } } },
  });
  assert.equal(noLevel.valid, false);
  if (!noLevel.valid) assert.equal(noLevel.code, "TRIAL_REPORT_INCOMPLETE");

  const noAction = validateOfflineLessonSubmission({
    ...base,
    payload: { trialReport: { ...complete, lessonFacts: { ...complete.lessonFacts, homeAction: " " } } },
  });
  assert.equal(noAction.valid, false);
});

test("an older trial kept as «individual» but linked to a booking is checked as a trial", () => {
  const result = validateOfflineLessonSubmission({
    lesson: { classType: "individual", group: null, trialBooking: { id: "booking-1" } },
    students: [{ name: "Клиент из заявки", attendanceStatus: "present" }],
    payload: {
      trialReport: {
        version: 3,
        diagnostics: {
          instrument: { level: "independent" },
          hearingPulse: { level: "independent" },
          movement: { level: "independent" },
          learnability: { level: "independent" },
        },
        lessonFacts: { achieved: "Звук", difficulty: "Рука", homeAction: "Пять минут" },
      },
    },
  });
  assert.equal(result.valid, true, "no topic is required from a trial");
});
