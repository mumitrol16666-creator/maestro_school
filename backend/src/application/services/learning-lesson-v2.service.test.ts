import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyLearningLessonResults,
  missingLearningHomeworkDecisions,
  planCompletionRewardTopicId,
  validateLearningLessonV2ResultDuplicates,
} from "./learning-lesson-v2.service.js";
import { LearningPlanTopicState } from "@prisma/client";

test("teacher changes learning results only while the report is editable", () => {
  assert.equal(canApplyLearningLessonResults("teacher", "started"), true);
  assert.equal(canApplyLearningLessonResults("teacher", "not_filled"), true);
  assert.equal(canApplyLearningLessonResults("teacher", "scheduled"), false);
  assert.equal(canApplyLearningLessonResults("teacher", "pending_admin_review"), false);
  assert.equal(canApplyLearningLessonResults("teacher", "completed"), false);
});

test("coordinator may correct learning results during administrative review", () => {
  assert.equal(canApplyLearningLessonResults("admin", "started"), true);
  assert.equal(canApplyLearningLessonResults("admin", "pending_admin_review"), true);
  assert.equal(canApplyLearningLessonResults("curator", "pending_admin_review"), true);
  assert.equal(canApplyLearningLessonResults("admin", "scheduled"), false);
  assert.equal(canApplyLearningLessonResults("admin", "completed"), false);
});

test("submission requires homework decisions only for students present at this lesson", () => {
  const missing = missingLearningHomeworkDecisions(
    [
      {
        crmStudentId: "present-student",
        pendingHomework: [
          { recipientId: "present-homework-1", cycleNumber: 2 },
          { recipientId: "present-homework-2", cycleNumber: 1 },
        ],
      },
      {
        crmStudentId: "absent-student",
        pendingHomework: [{ recipientId: "absent-homework", cycleNumber: 3 }],
      },
    ],
    new Set(["present-student"]),
    [{
      recipientId: "present-homework-1",
      cycleNumber: 2,
      decision: "accepted",
    }],
  );

  assert.deepEqual(missing, [{ recipientId: "present-homework-2", cycleNumber: 1 }]);
});

test("homework decision is matched by recipient and cycle", () => {
  const missing = missingLearningHomeworkDecisions(
    [{
      crmStudentId: "student-1",
      pendingHomework: [{ recipientId: "homework-1", cycleNumber: 2 }],
    }],
    new Set(["student-1"]),
    [{ recipientId: "homework-1", cycleNumber: 1, decision: "accepted" }],
  );

  assert.deepEqual(missing, [{ recipientId: "homework-1", cycleNumber: 2 }]);
});

test("only the final unfinished active topic previews the plan completion reward", () => {
  const topicId = planCompletionRewardTopicId({
    completionRewardSourceKey: null,
    topics: [
      {
        topicId: "mastered-topic",
        state: LearningPlanTopicState.active,
        topic: { progressPercent: 100, archivedAt: null },
      },
      {
        topicId: "final-topic",
        state: LearningPlanTopicState.active,
        topic: { progressPercent: 75, archivedAt: null },
      },
      {
        topicId: "draft-topic",
        state: LearningPlanTopicState.transferred,
        topic: { progressPercent: 0, archivedAt: null },
      },
    ],
  });

  assert.equal(topicId, "final-topic");
});

test("plan completion reward is not previewed without a unique unfinished topic", () => {
  const topics = [
    {
      topicId: "topic-1",
      state: LearningPlanTopicState.active,
      topic: { progressPercent: 25, archivedAt: null },
    },
    {
      topicId: "topic-2",
      state: LearningPlanTopicState.active,
      topic: { progressPercent: 50, archivedAt: null },
    },
  ];

  assert.equal(planCompletionRewardTopicId({
    completionRewardSourceKey: null,
    topics,
  }), null);
  assert.equal(planCompletionRewardTopicId({
    completionRewardSourceKey: "learning-plan-completion:plan-1",
    topics: [topics[0]],
  }), null);
  assert.equal(planCompletionRewardTopicId({
    completionRewardSourceKey: null,
    topics: [{
      ...topics[0],
      topic: { progressPercent: 25, archivedAt: new Date("2026-09-05T00:00:00Z") },
    }],
  }), null);
});

test("an approved snapshot keeps only internal duplicate invariants", () => {
  assert.doesNotThrow(() => validateLearningLessonV2ResultDuplicates({
    homeworkDecisions: [{
      recipientId: "homework-1",
      cycleNumber: 2,
      decision: "accepted",
    }],
    topicUpdates: [{
      topicId: "topic-from-submitted-plan",
      expectedPercent: 40,
      toPercent: 80,
    }],
  }));

  assert.throws(
    () => validateLearningLessonV2ResultDuplicates({
      homeworkDecisions: [],
      topicUpdates: [
        { topicId: "topic-1", expectedPercent: 0, toPercent: 50 },
        { topicId: "topic-1", expectedPercent: 0, toPercent: 100 },
      ],
    }),
    (error: unknown) => (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "LESSON_TOPIC_DUPLICATE"
    ),
  );
});
