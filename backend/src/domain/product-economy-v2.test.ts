import assert from "node:assert/strict";
import test from "node:test";
import {
  getProductLevel,
  pointsForCompletedPlan,
  PRODUCT_LEVELS,
  rankProductPoints,
  simulateLearningPace,
} from "./product-economy-v2.js";

test("LEVEL 1-10 advance at the confirmed thresholds", () => {
  assert.equal(getProductLevel(0).level.level, 1);
  assert.equal(getProductLevel(299).level.level, 1);
  assert.equal(getProductLevel(300).level.level, 2);
  assert.equal(getProductLevel(9_499).level.level, 8);
  assert.equal(getProductLevel(9_500).level.level, 9);
  assert.equal(getProductLevel(12_000).level.level, 10);
  assert.equal(getProductLevel(50_000).level.level, 10);
});

test("LEVEL progress is calculated only inside the current threshold range", () => {
  assert.deepEqual(
    {
      percent: getProductLevel(550).progressPercent,
      earned: getProductLevel(550).earnedWithinLevel,
      required: getProductLevel(550).requiredWithinLevel,
      remaining: getProductLevel(550).pointsToNext,
    },
    { percent: 50, earned: 250, required: 500, remaining: 250 },
  );
  assert.equal(getProductLevel(20_000).progressPercent, 100);
  assert.equal(getProductLevel(20_000).pointsToNext, 0);
});

test("all ten LEVEL masters have distinct confirmed tones and emblem forms", () => {
  assert.equal(new Set(PRODUCT_LEVELS.map((level) => level.tone)).size, 10);
  assert.equal(new Set(PRODUCT_LEVELS.map((level) => level.emblem)).size, 10);
  assert.equal(PRODUCT_LEVELS.at(-1)?.tone, "red");
  assert.equal(PRODUCT_LEVELS.at(-1)?.emblem, "crown");
});

test("top Points uses stable competition positions for equal balances", () => {
  const ranking = rankProductPoints([
    { studentId: "c", displayName: "Максим А.", points: 300 },
    { studentId: "b", displayName: "Алина С.", points: 1_500 },
    { studentId: "a", displayName: "Камбар К.", points: 1_500 },
    { studentId: "d", displayName: "Ноль Н.", points: -10 },
  ]);
  assert.deepEqual(ranking.map(({ studentId, points, position }) => ({ studentId, points, position })), [
    { studentId: "b", points: 1_500, position: 1 },
    { studentId: "a", points: 1_500, position: 1 },
    { studentId: "c", points: 300, position: 3 },
    { studentId: "d", points: 0, position: 4 },
  ]);
});

test("only a non-empty completed plan receives the plan bonus", () => {
  assert.equal(pointsForCompletedPlan(0), 0);
  assert.equal(pointsForCompletedPlan(4), 650);
  assert.equal(pointsForCompletedPlan(8), 1_050);
  assert.equal(pointsForCompletedPlan(12), 1_450);
});

test("4, 8 and 12 topic simulations match the documented learning pace", () => {
  assert.deepEqual(simulateLearningPace(4), {
    topicCount: 4,
    months: 12,
    pointsPerMonth: 650,
    points: 7_800,
    resultingLevel: 8,
    monthsToLevel10: 19,
  });
  assert.equal(simulateLearningPace(8).points, 12_600);
  assert.equal(simulateLearningPace(8).resultingLevel, 10);
  assert.equal(simulateLearningPace(8).monthsToLevel10, 12);
  assert.equal(simulateLearningPace(12).monthsToLevel10, 9);
});
