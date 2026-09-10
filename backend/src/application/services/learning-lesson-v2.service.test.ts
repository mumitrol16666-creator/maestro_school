import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyLearningLessonResults,
  learningHomeworkAssignmentRecipientsForApproval,
  missingLearningHomeworkDecisions,
  planCompletionRewardTopicId,
  validateLearningHomeworkAssignmentRecipients,
  validateLearningLessonV2ResultDuplicates,
  withInferredTopicHomeworkAssignment,
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

test("legacy lesson homework is attached to its only selected topic", () => {
  const result = withInferredTopicHomeworkAssignment(
    { homeworkDraft: "  Играть под метроном  " },
    {
      homeworkDecisions: [],
      topicUpdates: [{
        topicId: "topic-1",
        expectedPercent: 0,
        toPercent: 90,
      }],
    },
  );

  assert.deepEqual(result.homeworkAssignment, {
    topicId: "topic-1",
    instructions: "Играть под метроном",
  });
});

test("legacy homework is never guessed when the topic is ambiguous", () => {
  const source = {
    homeworkDecisions: [],
    topicUpdates: [
      { topicId: "topic-1", expectedPercent: 0, toPercent: 50 },
      { topicId: "topic-2", expectedPercent: 0, toPercent: 25 },
    ],
  };

  assert.strictEqual(
    withInferredTopicHomeworkAssignment({ homeworkDraft: "Повторить" }, source),
    source,
  );
});

test("an explicit empty homework assignment is not replaced from legacy text", () => {
  const source = {
    homeworkAssignment: null,
    homeworkDecisions: [],
    topicUpdates: [{ topicId: "topic-1", expectedPercent: 0, toPercent: 50 }],
  };

  assert.strictEqual(
    withInferredTopicHomeworkAssignment({ homeworkDraft: "Старый текст" }, source),
    source,
  );
});

test("a historical singleton topicIds assignment is normalized for finalization", () => {
  const result = withInferredTopicHomeworkAssignment(
    { homeworkDraft: "Старый текст" },
    {
      homeworkAssignment: {
        topicIds: ["topic-1"],
        instructions: "  Выучить слова и аккорды  ",
      },
      homeworkDecisions: [],
      topicUpdates: [{ topicId: "topic-1", expectedPercent: 0, toPercent: 90 }],
    } as unknown as Parameters<typeof withInferredTopicHomeworkAssignment>[1],
  );

  assert.deepEqual(result.homeworkAssignment, {
    topicId: "topic-1",
    instructions: "Выучить слова и аккорды",
  });
});

test("a historical empty topicIds assignment is treated as no V2 assignment", () => {
  const result = withInferredTopicHomeworkAssignment(
    { homeworkDraft: "Отработать материал дома" },
    {
      homeworkAssignment: {
        topicIds: [],
        instructions: "Отработать материал дома",
      },
      homeworkDecisions: [],
      topicUpdates: [],
    } as unknown as Parameters<typeof withInferredTopicHomeworkAssignment>[1],
  );

  assert.equal(result.homeworkAssignment, null);
});

test("submission rejects a new homework assignment when nobody attended", () => {
  assert.throws(
    () => validateLearningHomeworkAssignmentRecipients({
      homeworkAssignment: {
        topicId: "topic-1",
        instructions: "Повторить упражнение",
      },
      homeworkDecisions: [],
      topicUpdates: [],
    }, new Set()),
    (error: unknown) => (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "HOMEWORK_RECIPIENTS_REQUIRED"
    ),
  );
  assert.doesNotThrow(() => validateLearningHomeworkAssignmentRecipients({
    homeworkAssignment: {
      topicId: "topic-1",
      instructions: "Повторить упражнение",
    },
    homeworkDecisions: [],
    topicUpdates: [],
  }, new Set(["student-1"])));
  assert.doesNotThrow(() => validateLearningHomeworkAssignmentRecipients({
    homeworkDecisions: [],
    topicUpdates: [],
  }, new Set()));
});

test("approval safely skips an assignment if an old submitted snapshot has no recipients", () => {
  const input = {
    homeworkAssignment: {
      topicId: "topic-1",
      instructions: "Повторить упражнение",
    },
    homeworkDecisions: [],
    topicUpdates: [],
  };

  assert.equal(learningHomeworkAssignmentRecipientsForApproval(input, {
    recipientCrmStudentIds: [],
  }), null);
  assert.deepEqual(learningHomeworkAssignmentRecipientsForApproval(input, {
    recipientCrmStudentIds: [" student-2 ", "student-1", "student-2"],
  }), ["student-2", "student-1"]);
});
