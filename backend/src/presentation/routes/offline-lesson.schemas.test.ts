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
