import assert from "node:assert/strict";
import test from "node:test";
import { sameLearningHomeworkReviewRequest } from "./learning-homework-v2.service.js";
import { sameLearningTopicProgressRequest } from "./learning-plan-v2.service.js";

test("concurrent duplicate homework review is accepted only for the exact request", () => {
  const stored = {
    recipientId: "recipient-1",
    reviewerId: "teacher-1",
    decision: "accepted" as const,
    comment: null,
  };

  assert.equal(sameLearningHomeworkReviewRequest(stored, {
    recipientId: "recipient-1",
    reviewerUserId: "teacher-1",
    decision: "accepted",
    comment: null,
  }), true);
  assert.equal(sameLearningHomeworkReviewRequest(stored, {
    recipientId: "recipient-1",
    reviewerUserId: "teacher-1",
    decision: "revision",
    comment: null,
  }), false);
});

test("concurrent duplicate topic progress is accepted only for the same target", () => {
  assert.equal(sameLearningTopicProgressRequest(
    { topicId: "topic-1", toPercent: 100 },
    { topicId: "topic-1", toPercent: 100 },
  ), true);
  assert.equal(sameLearningTopicProgressRequest(
    { topicId: "topic-1", toPercent: 100 },
    { topicId: "topic-1", toPercent: 80 },
  ), false);
});
