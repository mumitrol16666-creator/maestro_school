import assert from "node:assert/strict";
import test from "node:test";
import { calculateHomeworkStatistics } from "./homework-statistics.js";

test("статистика ДЗ считает уникальные назначения, а не версии ответа", () => {
  const result = calculateHomeworkStatistics([
    { state: "accepted", currentCycle: 1, attemptCount: 3 },
    { state: "accepted_with_comment", currentCycle: 2, attemptCount: 2 },
    { state: "waiting_review", currentCycle: 1, attemptCount: 2 },
    { state: "revision", currentCycle: 2, attemptCount: 1 },
    { state: "assigned", currentCycle: 1, attemptCount: 0 },
  ]);

  assert.deepEqual(result, {
    assigned: 5,
    submitted: 4,
    waitingReview: 1,
    revision: 1,
    accepted: 2,
    acceptedFirstPass: 1,
    acceptedAfterRevision: 1,
    noAttempt: 1,
    submissionRate: 80,
    firstPassRate: 50,
    averageCycles: 1.5,
  });
});

test("пустой период не создаёт ложные проценты", () => {
  assert.deepEqual(calculateHomeworkStatistics([]), {
    assigned: 0,
    submitted: 0,
    waitingReview: 0,
    revision: 0,
    accepted: 0,
    acceptedFirstPass: 0,
    acceptedAfterRevision: 0,
    noAttempt: 0,
    submissionRate: null,
    firstPassRate: null,
    averageCycles: null,
  });
});
