import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearningTopicsV2MigrationPlan,
  legacyLearningPlanSourceKey,
  type LegacyLearningPlanInput,
} from "./learning-topics-v2-migration.js";

const DIRECTION_ID = "11111111-1111-4111-8111-111111111111";
const PUBLISHED_AT = new Date("2026-08-20T12:00:00.000Z");

function legacyPlan(
  overrides: Partial<LegacyLearningPlanInput> = {},
): LegacyLearningPlanInput {
  return {
    kind: "student",
    id: "22222222-2222-4222-8222-222222222222",
    ownerId: "crm-student-1",
    teacherUserId: "33333333-3333-4333-8333-333333333333",
    month: "2026-08",
    expectedResult: "Result",
    skills: "Skills",
    checkpoint: "Checkpoint",
    note: "Note",
    publishedSnapshot: {
      schemaVersion: 1,
      goal: "Goal",
      items: [
        { id: "topic-1", title: "Chords", status: "planned" },
      ],
      progress: { completed: 0, inProgress: 0, total: 1, percent: 0 },
    },
    publishedAt: PUBLISHED_AT,
    draftRevision: 2,
    publishedRevision: 2,
    ...overrides,
  };
}

function mappedDirection(input: LegacyLearningPlanInput) {
  return { [legacyLearningPlanSourceKey(input.kind, input.id)]: DIRECTION_ID };
}

test("does not guess a direction for a legacy plan", () => {
  const input = legacyPlan();
  const result = buildLearningTopicsV2MigrationPlan([input], {});

  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.unresolved, [{
    sourceKey: legacyLearningPlanSourceKey(input.kind, input.id),
    reason: "direction_mapping_missing",
  }]);
});

test("keeps legacy in-progress topics without an invented percentage", () => {
  const input = legacyPlan({
    publishedSnapshot: {
      schemaVersion: 1,
      goal: "Goal",
      items: [{ id: "topic-1", title: "Chords", status: "in_progress" }],
      progress: { completed: 0, inProgress: 1, total: 1, percent: 0 },
    },
  });
  const result = buildLearningTopicsV2MigrationPlan([input], mappedDirection(input));

  assert.equal(result.unresolved.length, 0);
  assert.equal(result.candidates[0]?.topics[0]?.progressPercent, null);
  assert.equal(result.candidates[0]?.topics[0]?.progressSourceKey, null);
});

test("blocks retroactive rewards for already completed topics and plans", () => {
  const input = legacyPlan({
    publishedSnapshot: {
      schemaVersion: 1,
      goal: "Goal",
      items: [{ id: "topic-1", title: "Chords", status: "completed" }],
      progress: { completed: 1, inProgress: 0, total: 1, percent: 100 },
    },
  });
  const result = buildLearningTopicsV2MigrationPlan([input], mappedDirection(input));
  const candidate = result.candidates[0];

  assert.equal(candidate?.topics[0]?.progressPercent, 100);
  assert.match(candidate?.topics[0]?.masteryRewardSourceKey ?? "", /blocked-before-cutover$/);
  assert.match(candidate?.completionRewardSourceKey ?? "", /blocked-before-cutover$/);
  assert.deepEqual(candidate?.completedAt, PUBLISHED_AT);
  assert.deepEqual(candidate?.lockedAt, PUBLISHED_AT);
});

test("refuses to rewrite published metadata from a newer draft", () => {
  const input = legacyPlan({ draftRevision: 3, publishedRevision: 2 });
  const result = buildLearningTopicsV2MigrationPlan([input], mappedDirection(input));

  assert.equal(result.candidates.length, 0);
  assert.equal(result.unresolved[0]?.reason, "published_revision_diverged");
});

test("generates stable source keys for repeatable execution", () => {
  const input = legacyPlan();
  const first = buildLearningTopicsV2MigrationPlan([input], mappedDirection(input));
  const second = buildLearningTopicsV2MigrationPlan([input], mappedDirection(input));

  assert.deepEqual(first, second);
});

test("reports normalized target collisions before writing", () => {
  const first = legacyPlan();
  const second = legacyPlan({
    id: "44444444-4444-4444-8444-444444444444",
    teacherUserId: "55555555-5555-4555-8555-555555555555",
  });
  const directionMap = {
    ...mappedDirection(first),
    ...mappedDirection(second),
  };
  const result = buildLearningTopicsV2MigrationPlan([first, second], directionMap);

  assert.equal(result.candidates.length, 0);
  assert.equal(result.unresolved.length, 2);
  assert.ok(result.unresolved.every((issue) => issue.reason === "target_collision"));
});
