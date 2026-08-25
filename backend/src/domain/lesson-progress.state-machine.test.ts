import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canStudentCompleteWithoutHomework,
  canStudentTransition,
  canSystemTransition,
  isLessonCompleted,
  LESSON_STATE_MACHINE,
} from "./lesson-progress.state-machine.js";

describe("lesson progress state machine", () => {
  it("defines all six statuses", () => {
    assert.equal(Object.keys(LESSON_STATE_MACHINE).length, 6);
    assert.equal(isLessonCompleted("completed"), true);
    assert.equal(isLessonCompleted("reviewed"), false);
    assert.equal(isLessonCompleted("submitted"), false);
  });

  it("allows student flow: available → in_progress → submitted", () => {
    assert.equal(canStudentTransition("available", "in_progress"), true);
    assert.equal(canStudentTransition("in_progress", "submitted"), true);
    assert.equal(canStudentTransition("locked", "available"), false);
    assert.equal(canStudentTransition("submitted", "completed"), false);
  });

  it("allows self-completion only for an in-progress lesson without homework", () => {
    assert.equal(canStudentCompleteWithoutHomework("in_progress", false), true);
    assert.equal(canStudentCompleteWithoutHomework("available", false), false);
    assert.equal(canStudentCompleteWithoutHomework("in_progress", true), false);
    assert.equal(canStudentCompleteWithoutHomework("completed", false), false);
  });

  it("allows system unlock locked → available", () => {
    assert.equal(canSystemTransition("locked", "available"), true);
  });

  it("allows admin approve paths from submitted and reviewed", () => {
    assert.equal(canSystemTransition("submitted", "completed"), true);
    assert.equal(canSystemTransition("submitted", "reviewed"), true);
    assert.equal(canSystemTransition("reviewed", "completed"), true);
  });

  it("allows revision paths directly to in progress", () => {
    assert.equal(canSystemTransition("submitted", "in_progress"), true);
    assert.equal(canSystemTransition("reviewed", "in_progress"), true);
    assert.equal(canSystemTransition("submitted", "available"), true);
    assert.equal(canSystemTransition("reviewed", "available"), true);
    assert.equal(canSystemTransition("completed", "available"), false);
    assert.equal(canSystemTransition("completed", "in_progress"), false);
  });

  it("completed is terminal", () => {
    assert.deepEqual(LESSON_STATE_MACHINE.completed.next, []);
  });
});
