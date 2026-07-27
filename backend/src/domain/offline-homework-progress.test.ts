import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkOfflineHomeworkResults } from "./offline-homework-progress.js";

describe("offline homework progress", () => {
  it("links a review to homework assigned at the previous lesson", () => {
    const results = linkOfflineHomeworkResults(
      [
        {
          crmClassId: "lesson-1",
          date: "2026-07-01",
          startTime: "18:00",
          homework: "Повторить переход Am–Dm",
          teacherName: "Алексей",
        },
        {
          crmClassId: "lesson-2",
          date: "2026-07-08",
          startTime: "18:00",
          homework: "Играть под метроном",
          teacherName: "Алексей",
        },
      ],
      [
        {
          crmClassId: "lesson-2",
          status: "partial",
          completionPercent: 75,
          reviewedAt: new Date("2026-07-08T13:00:00.000Z"),
        },
      ],
    );

    assert.deepEqual(results.get("lesson-1"), {
      status: "partial",
      completionPercent: 75,
      reviewedAt: "2026-07-08T13:00:00.000Z",
    });
    assert.equal(results.has("lesson-2"), false);
  });

  it("normalizes completed and not completed reviews", () => {
    const lessons = [
      { crmClassId: "lesson-1", date: "2026-07-01", homework: "Задание 1" },
      { crmClassId: "lesson-2", date: "2026-07-08", homework: "Задание 2" },
      { crmClassId: "lesson-3", date: "2026-07-15", homework: "Задание 3" },
    ];
    const results = linkOfflineHomeworkResults(lessons, [
      { crmClassId: "lesson-2", status: "completed" },
      { crmClassId: "lesson-3", status: "not_completed" },
    ]);

    assert.equal(results.get("lesson-1")?.completionPercent, 100);
    assert.equal(results.get("lesson-2")?.completionPercent, 0);
  });

  it("does not attach a review from another parallel group", () => {
    const results = linkOfflineHomeworkResults(
      [
        {
          crmClassId: "guitar-1",
          date: "2026-07-01",
          homework: "Гитарное задание",
          groupName: "Гитара",
        },
        {
          crmClassId: "vocal-1",
          date: "2026-07-02",
          homework: "Вокальное задание",
          groupName: "Вокал",
        },
        {
          crmClassId: "guitar-2",
          date: "2026-07-08",
          groupName: "Гитара",
        },
      ],
      [{ crmClassId: "guitar-2", status: "completed", completionPercent: 100 }],
    );

    assert.equal(results.get("guitar-1")?.completionPercent, 100);
    assert.equal(results.has("vocal-1"), false);
  });

  it("keeps unreviewed homework pending", () => {
    const results = linkOfflineHomeworkResults(
      [{ crmClassId: "lesson-1", date: "2026-07-01", homework: "Задание" }],
      [{ crmClassId: "lesson-1", status: "not_checked" }],
    );

    assert.equal(results.size, 0);
  });
});
