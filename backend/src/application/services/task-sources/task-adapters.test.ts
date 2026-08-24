import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapCourseTask } from "./course-task.adapter.js";
import { mapOfflineTask } from "./offline-task.adapter.js";
import { mapOnlineTask } from "./online-task.adapter.js";

const now = new Date("2026-08-24T10:00:00.000Z");

describe("unified task adapters", () => {
  it("maps course rejected submission to revision and approved test result to completed", () => {
    const base = {
      homeworkId: "homework",
      homeworkType: "test" as const,
      homeworkDescription: "Проверить знания",
      homeworkCreatedAt: new Date("2026-08-20T10:00:00.000Z"),
      lessonId: "lesson",
      lessonTitle: "Аккорды",
      lessonPoints: 20,
      moduleTitle: "Модуль 1",
      courseTitle: "Гитара",
      progress: { status: "submitted" as const, createdAt: now, updatedAt: now },
    };
    const rejected = mapCourseTask({ ...base, submission: { status: "rejected", testScore: 55, reviewComment: "Повтори", createdAt: now, updatedAt: now } }, now);
    const approved = mapCourseTask({ ...base, submission: { status: "approved", testScore: 85, reviewComment: null, createdAt: now, updatedAt: now } }, now);
    assert.equal(rejected?.status, "needs_revision");
    assert.equal(rejected?.actionRequired, true);
    assert.equal(approved?.status, "completed");
    assert.equal(approved?.result.scorePercent, 85);
  });

  it("does not expose an unopened course homework", () => {
    const mapped = mapCourseTask({
      homeworkId: "homework", homeworkType: "assignment", homeworkDescription: "ДЗ", homeworkCreatedAt: now,
      lessonId: "lesson", lessonTitle: "Урок", lessonPoints: 10, moduleTitle: "Модуль", courseTitle: "Курс",
      progress: { status: "available", createdAt: now, updatedAt: now }, submission: null,
    }, now);
    assert.equal(mapped, null);
  });

  it("maps returned and overdue online assignment", () => {
    const mapped = mapOnlineTask({
      assignmentId: "a", requestId: "r", title: "Ритм", description: "Записать видео",
      directionTitle: "Гитара", teacherName: "Иван", dueAt: new Date("2026-08-23T10:00:00.000Z"),
      createdAt: new Date("2026-08-20T10:00:00.000Z"), updatedAt: now, pointsReward: 15,
      submission: { status: "returned", reviewComment: "Медленнее", reviewPoints: null, reviewCoins: 0, createdAt: now, updatedAt: now },
    }, now);
    assert.equal(mapped.status, "needs_revision");
    assert.equal(mapped.timing.overdue, true);
    assert.equal(mapped.target.href, "/online-lessons/r");
  });

  it("maps offline partial review and next lesson without false overdue", () => {
    const mapped = mapOfflineTask({
      crmClassId: "one", title: "Индивидуальный урок", date: "2026-08-20", startTime: "17:00",
      status: "completed", crmTeacherId: "teacher", teacherName: "Иван", homework: "Переход C → G",
      homeworkResult: { status: "partial", completionPercent: 60, reviewedAt: "2026-08-22T12:00:00.000Z" },
    }, [{
      crmClassId: "two", title: "Индивидуальный урок", date: "2026-08-25", startTime: "17:00",
      status: "scheduled", crmTeacherId: "teacher", teacherName: "Иван", homework: null,
    }], now);
    assert.equal(mapped?.status, "needs_revision");
    assert.equal(mapped?.result.completionPercent, 60);
    assert.equal(mapped?.timing.dueKind, "next_lesson");
    assert.equal(mapped?.timing.overdue, false);
  });

  it("excludes offline not-assigned and unfinished classes", () => {
    const notAssigned = mapOfflineTask({
      crmClassId: "one", title: "Урок", date: "2026-08-20", status: "completed", homework: "ДЗ",
      homeworkReview: { status: "not_assigned" },
    }, [], now);
    const unfinished = mapOfflineTask({
      crmClassId: "two", title: "Урок", date: "2026-08-20", status: "pending_admin_review", homework: "ДЗ",
    }, [], now);
    assert.equal(notAssigned, null);
    assert.equal(unfinished, null);
  });
});
