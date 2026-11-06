import assert from "node:assert/strict";
import test from "node:test";
import { studentPointsProgression } from "./student-points-progression.js";

test("current Points expose LEVEL without simultaneously exposing a historical rank", () => {
  for (const points of [0, 100, 300, 1500, 12000, 15000]) {
    const current = studentPointsProgression("level", points);
    assert.equal(current.rank, null);
    assert.equal(current.level?.points, points);
  }
  assert.equal(studentPointsProgression("level", 1500).level?.level.level, 4);
});

test("historical Points remain readable without acquiring a current LEVEL", () => {
  const historical = studentPointsProgression("legacy", 1500);
  assert.equal(historical.level, null);
  assert.equal(historical.rank?.current.code, "maestro");
});
