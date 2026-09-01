import assert from "node:assert/strict";
import test from "node:test";
import { canApplyLearningLessonResults } from "./learning-lesson-v2.service.js";

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
