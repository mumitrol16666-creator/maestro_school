import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LessonProgressStatus } from "@prisma/client";
import {
  calculateProgressPercent,
  findNextLessonId,
  resolveLessonAvailability,
} from "./lesson-unlock.logic.js";

const lessons = [
  { id: "l1", sortOrder: 1 },
  { id: "l2", sortOrder: 2 },
  { id: "l3", sortOrder: 3 },
  { id: "l4", sortOrder: 4 },
];

function map(entries: [string, LessonProgressStatus][]): Map<string, { status: LessonProgressStatus }> {
  return new Map(entries.map(([id, status]) => [id, { status }]));
}

describe("lesson unlock logic", () => {
  it("first lesson is always available when no progress", () => {
    const status = resolveLessonAvailability("l1", 0, lessons, new Map());
    assert.equal(status, "available");
  });

  it("second lesson is locked when first is not completed", () => {
    const progress = map([["l1", "in_progress"]]);
    const status = resolveLessonAvailability("l2", 1, lessons, progress);
    assert.equal(status, "locked");
  });

  it("second lesson becomes available when first is completed", () => {
    const progress = map([["l1", "completed"]]);
    const status = resolveLessonAvailability("l2", 1, lessons, progress);
    assert.equal(status, "available");
  });

  it("preserves in_progress status on existing progress", () => {
    const progress = map([["l2", "in_progress"]]);
    const status = resolveLessonAvailability("l2", 1, lessons, progress);
    assert.equal(status, "in_progress");
  });

  it("preserves submitted status on existing progress", () => {
    const progress = map([["l1", "completed"], ["l2", "submitted"]]);
    const status = resolveLessonAvailability("l2", 1, lessons, progress);
    assert.equal(status, "submitted");
  });

  it("finds next lesson after completed", () => {
    assert.equal(findNextLessonId("l1", lessons), "l2");
    assert.equal(findNextLessonId("l4", lessons), null);
    assert.equal(findNextLessonId("unknown", lessons), null);
  });
});

describe("course progress percent", () => {
  it("returns 0 when no lessons", () => {
    assert.equal(calculateProgressPercent(0, 0), 0);
  });

  it("calculates completedLessons / totalLessons * 100", () => {
    assert.equal(calculateProgressPercent(1, 4), 25);
    assert.equal(calculateProgressPercent(3, 4), 75);
    assert.equal(calculateProgressPercent(4, 4), 100);
  });
});
