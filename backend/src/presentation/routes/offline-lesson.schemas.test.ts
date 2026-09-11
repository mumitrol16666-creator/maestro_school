import assert from "node:assert/strict";
import test from "node:test";
import { learningLessonResultsSchema } from "./offline-lesson.schemas.js";

test("lesson results schema rejects duplicate homework decisions", () => {
  const recipientId = "11111111-1111-4111-8111-111111111111";
  const result = learningLessonResultsSchema.safeParse({
    homeworkDecisions: [
      { recipientId, cycleNumber: 1, decision: "accepted" },
      { recipientId, cycleNumber: 1, decision: "accepted" },
    ],
    topicUpdates: [],
  });

  assert.equal(result.success, false);
});

test("lesson results schema rejects duplicate topic updates", () => {
  const topicId = "22222222-2222-4222-8222-222222222222";
  const result = learningLessonResultsSchema.safeParse({
    homeworkDecisions: [],
    topicUpdates: [
      { topicId, expectedPercent: 10, toPercent: 20 },
      { topicId, expectedPercent: 20, toPercent: 30 },
    ],
  });

  assert.equal(result.success, false);
});

test("lesson results schema accepts every topic from a 50-item monthly plan", () => {
  const topicUpdates = Array.from({ length: 50 }, (_, index) => ({
    topicId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    expectedPercent: 0,
    toPercent: index + 1,
  }));

  assert.equal(learningLessonResultsSchema.safeParse({
    homeworkDecisions: [],
    topicUpdates,
  }).success, true);
  assert.equal(learningLessonResultsSchema.safeParse({
    homeworkDecisions: [],
    topicUpdates: [
      ...topicUpdates,
      {
        topicId: "22222222-2222-4222-8222-000000000051",
        expectedPercent: 0,
        toPercent: 51,
      },
    ],
  }).success, false);
});

test("lesson results schema accepts a topic-linked homework assignment", () => {
  const result = learningLessonResultsSchema.safeParse({
    homeworkAssignment: {
      topicId: "22222222-2222-4222-8222-222222222222",
      instructions: "Повторить переходы под метроном 15 минут",
    },
    homeworkDecisions: [],
    topicUpdates: [],
  });

  assert.equal(result.success, true);
});

test("lesson results schema rejects an empty homework assignment", () => {
  const result = learningLessonResultsSchema.safeParse({
    homeworkAssignment: {
      topicId: "22222222-2222-4222-8222-222222222222",
      instructions: "   ",
    },
    homeworkDecisions: [],
    topicUpdates: [],
  });

  assert.equal(result.success, false);
});
