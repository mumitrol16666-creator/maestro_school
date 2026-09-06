import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const {
  learningPlanCompletionResultsByClassId,
  learningPlanIdFromCompletionRewardSourceKey,
  learningTopicResultsByClassId,
  lessonIdFromTopicProgressSourceKey,
} = await import("./school-offline.service.js");

const studentId = "00000000-0000-4000-8000-000000000101";
const topicInProgressId = "00000000-0000-4000-8000-000000000201";
const topicMasteredId = "00000000-0000-4000-8000-000000000202";
const learningPlanId = "00000000-0000-4000-8000-000000000301";

test("lesson topic source key preserves the complete CRM class id", () => {
  assert.equal(
    lessonIdFromTopicProgressSourceKey(
      `offline-lesson:QA:CLASS-IND-EDITABLE:topic:${topicInProgressId}`,
      topicInProgressId,
    ),
    "QA:CLASS-IND-EDITABLE",
  );
  assert.equal(
    lessonIdFromTopicProgressSourceKey(
      `offline-lesson:QA-CLASS:topic:${topicMasteredId}`,
      topicInProgressId,
    ),
    null,
  );
  assert.equal(
    lessonIdFromTopicProgressSourceKey(
      `teacher:QA-CLASS:topic:${topicInProgressId}`,
      topicInProgressId,
    ),
    null,
  );
});

test("student lesson history maps V2 progress and only the factual mastery reward", () => {
  const occurredAt = new Date("2026-09-05T08:00:00.000Z");
  const results = learningTopicResultsByClassId(
    ["QA-CLASS"],
    studentId,
    [
      {
        topicId: topicInProgressId,
        fromPercent: 45,
        toPercent: 75,
        comment: "Ритм стал стабильнее",
        sourceKey: `offline-lesson:QA-CLASS:topic:${topicInProgressId}`,
        occurredAt,
        topic: { title: "Стабильный бой восьмыми" },
      },
      {
        topicId: topicMasteredId,
        fromPercent: 75,
        toPercent: 100,
        comment: null,
        sourceKey: `offline-lesson:QA-CLASS:topic:${topicMasteredId}`,
        occurredAt,
        topic: { title: "Чистые переходы аккордов" },
      },
      {
        topicId: topicMasteredId,
        fromPercent: 0,
        toPercent: 100,
        comment: null,
        sourceKey: `offline-lesson:OTHER-CLASS:topic:${topicMasteredId}`,
        occurredAt,
        topic: { title: "Чужая тема" },
      },
    ],
    [{
      sourceKey: `learning-topic-mastery:${topicMasteredId}:${studentId}`,
      amount: 100,
    }],
  );

  assert.deepEqual(results.get("QA-CLASS"), [
    {
      topicId: topicInProgressId,
      title: "Стабильный бой восьмыми",
      fromPercent: 45,
      toPercent: 75,
      comment: "Ритм стал стабильнее",
      occurredAt: "2026-09-05T08:00:00.000Z",
      mastered: false,
      masteryPointsAwarded: 0,
    },
    {
      topicId: topicMasteredId,
      title: "Чистые переходы аккордов",
      fromPercent: 75,
      toPercent: 100,
      comment: null,
      occurredAt: "2026-09-05T08:00:00.000Z",
      mastered: true,
      masteryPointsAwarded: 100,
    },
  ]);
  assert.equal(results.has("OTHER-CLASS"), false);
});

test("100 percent without a student ledger receipt does not claim a reward", () => {
  const results = learningTopicResultsByClassId(
    ["QA-CLASS"],
    studentId,
    [{
      topicId: topicMasteredId,
      fromPercent: null,
      toPercent: 100,
      comment: null,
      sourceKey: `offline-lesson:QA-CLASS:topic:${topicMasteredId}`,
      occurredAt: new Date("2026-09-05T08:00:00.000Z"),
      topic: { title: "Чистые переходы аккордов" },
    }],
    [],
  );

  assert.equal(results.get("QA-CLASS")?.[0]?.mastered, true);
  assert.equal(results.get("QA-CLASS")?.[0]?.masteryPointsAwarded, 0);
});

test("plan completion reward key is scoped to the exact student", () => {
  const sourceKey = `learning-plan-completion:${learningPlanId}:${studentId}`;
  assert.equal(
    learningPlanIdFromCompletionRewardSourceKey(sourceKey, studentId),
    learningPlanId,
  );
  assert.equal(
    learningPlanIdFromCompletionRewardSourceKey(
      sourceKey,
      "00000000-0000-4000-8000-000000000102",
    ),
    null,
  );
});

test("student lesson history maps a factual +250 plan completion to the closing lesson", () => {
  const completedAt = new Date("2026-09-05T08:00:00.000Z");
  const events = [
    {
      topicId: topicMasteredId,
      fromPercent: 75,
      toPercent: 100,
      comment: null,
      sourceKey: `offline-lesson:QA-CLASS:topic:${topicMasteredId}`,
      occurredAt: completedAt,
      topic: { title: "Чистые переходы аккордов" },
    },
    {
      topicId: topicInProgressId,
      fromPercent: 80,
      toPercent: 100,
      comment: null,
      sourceKey: `offline-lesson:QA-CLASS:topic:${topicInProgressId}`,
      occurredAt: completedAt,
      topic: { title: "Стабильный бой восьмыми" },
    },
  ];
  const results = learningPlanCompletionResultsByClassId(
    ["QA-CLASS"],
    studentId,
    events,
    [{
      sourceKey: `learning-plan-completion:${learningPlanId}:${studentId}`,
      amount: 250,
      createdAt: completedAt,
    }],
    [{
      id: learningPlanId,
      month: "2026-09",
      completedAt,
      publishedVersionNumber: 2,
      versions: [{
        version: 2,
        topics: [
          { topicId: topicMasteredId, state: "active" },
          { topicId: topicInProgressId, state: "active" },
        ],
      }],
    }],
  );

  assert.deepEqual(results.get("QA-CLASS"), [{
    planId: learningPlanId,
    month: "2026-09",
    completedAt: completedAt.toISOString(),
    pointsAwarded: 250,
  }]);
});

test("plan completion history never claims an absent, mismatched, or ambiguous reward", () => {
  const completedAt = new Date("2026-09-05T08:00:00.000Z");
  const event = (crmClassId: string) => ({
    topicId: topicMasteredId,
    fromPercent: 75,
    toPercent: 100,
    comment: null,
    sourceKey: `offline-lesson:${crmClassId}:topic:${topicMasteredId}`,
    occurredAt: completedAt,
    topic: { title: "Чистые переходы аккордов" },
  });
  const plan = {
    id: learningPlanId,
    month: "2026-09",
    completedAt,
    publishedVersionNumber: 1,
    versions: [{
      version: 1,
      topics: [{ topicId: topicMasteredId, state: "active" }],
    }],
  };

  assert.equal(
    learningPlanCompletionResultsByClassId(
      ["QA-CLASS"], studentId, [event("QA-CLASS")], [], [plan],
    ).size,
    0,
  );
  assert.equal(
    learningPlanCompletionResultsByClassId(
      ["QA-CLASS"],
      studentId,
      [event("QA-CLASS")],
      [{
        sourceKey: `learning-plan-completion:${learningPlanId}:${studentId}`,
        amount: 250,
        createdAt: new Date("2026-09-05T08:00:01.000Z"),
      }],
      [plan],
    ).size,
    0,
  );
  assert.equal(
    learningPlanCompletionResultsByClassId(
      ["QA-CLASS", "OTHER-CLASS"],
      studentId,
      [event("QA-CLASS"), event("OTHER-CLASS")],
      [{
        sourceKey: `learning-plan-completion:${learningPlanId}:${studentId}`,
        amount: 250,
        createdAt: completedAt,
      }],
      [plan],
    ).size,
    0,
  );
});
