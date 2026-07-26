import assert from "node:assert/strict";
import test from "node:test";
import { getStudentRank } from "./student-rank.js";

test("student rank advances at exact point thresholds", () => {
  assert.equal(getStudentRank(0).current.code, "first_strings");
  assert.equal(getStudentRank(99).current.code, "first_strings");
  assert.equal(getStudentRank(100).current.code, "rhythm");
  assert.equal(getStudentRank(600).current.code, "musician");
});

test("student rank reports progress and points to the next rank", () => {
  assert.deepEqual(getStudentRank(200), {
    current: { code: "rhythm", title: "Ритм", minPoints: 100 },
    next: { code: "chord", title: "Аккорд", minPoints: 300 },
    points: 200,
    pointsToNext: 100,
    progressPercent: 50,
    isMaxRank: false,
  });
});

test("Maestro is the maximum rank", () => {
  const rank = getStudentRank(2500);
  assert.equal(rank.current.code, "maestro");
  assert.equal(rank.next, null);
  assert.equal(rank.progressPercent, 100);
  assert.equal(rank.isMaxRank, true);
});
