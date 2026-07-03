import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCourseCompletedByLessonCounts } from "./course-progress.service.js";

describe("course completion by lesson counts", () => {
  it("does not complete an empty course", () => {
    assert.equal(isCourseCompletedByLessonCounts(0, 0), false);
  });

  it("does not complete a course while published lessons remain unfinished", () => {
    assert.equal(isCourseCompletedByLessonCounts(2, 3), false);
  });

  it("completes a course when all published lessons are completed", () => {
    assert.equal(isCourseCompletedByLessonCounts(3, 3), true);
    assert.equal(isCourseCompletedByLessonCounts(4, 3), true);
  });
});
