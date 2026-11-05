import test from "node:test";
import assert from "node:assert/strict";
import { sectorProgress, type SectorTopic } from "../../src/lib/sector-progress.js";

const topic = (id: string, status: SectorTopic["status"], percent: number | null, state: SectorTopic["state"] = "active"): SectorTopic => ({ id, title: id, status, progressPercent: percent, state });

test("material progress counts mastered topics rather than averaging practice percentages", () => {
  const p = sectorProgress([topic("mastered", "completed", 100), topic("practising", "in_progress", 99), topic("future", "planned", 0)]);
  assert.deepEqual([p.completed, p.working, p.planned, p.percent], [1, 1, 1, 33]);
  assert.equal(p.focus?.id, "practising");
});

test("transferred and replaced topics cannot inflate the sector denominator", () => {
  const p = sectorProgress([topic("current", "completed", 100), topic("transferred", "completed", 100, "transferred"), topic("replaced", "planned", 0, "replaced"), topic("legacy-moved", "moved", null)]);
  assert.deepEqual([p.total, p.completed, p.percent], [1, 1, 100]);
});

test("missing percentages remain readable and an empty sector has no fictional mastery", () => {
  assert.equal(sectorProgress([topic("unknown", "planned", null)]).planned, 1);
  const p = sectorProgress([]);
  assert.deepEqual([p.total, p.percent, p.focus], [0, 0, null]);
});

test("all mastered topics leave no suggested practice topic and do not invent an exam result", () => {
  const p = sectorProgress([topic("a", "completed", 100)]);
  assert.equal(p.focus, null);
  assert.equal("examReady" in p, false);
});
