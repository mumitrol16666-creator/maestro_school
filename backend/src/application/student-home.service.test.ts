import assert from "node:assert/strict";
import test from "node:test";
import { selectOfflineHomeworks } from "./services/student-home.service.js";

test("student home keeps new homework separate from the previous review", () => {
  const history = [
    {
      crmClassId: "new",
      title: "Гитара",
      date: "2026-08-20T00:00:00.000Z",
      startTime: "17:00",
      endTime: "17:45",
      status: "completed",
      crmGroupId: "guitar",
      crmTeacherId: "teacher",
      topic: "Бой",
      homework: "Играть бой под метроном",
      homeworkReview: null,
    },
    {
      crmClassId: "old",
      title: "Гитара",
      date: "2026-08-13T00:00:00.000Z",
      startTime: "17:00",
      endTime: "17:45",
      status: "completed",
      crmGroupId: "guitar",
      crmTeacherId: "teacher",
      topic: "Аккорды",
      homework: "Переход C → G",
      homeworkReview: { status: "partial", completionPercent: 70, difficulties: "Ровность" },
    },
  ];
  const upcoming = [{
    crmClassId: "next",
    title: "Гитара",
    date: "2026-08-27T00:00:00.000Z",
    startTime: "17:00",
    endTime: "17:45",
    status: "scheduled",
    crmGroupId: "guitar",
    crmTeacherId: "teacher",
  }];

  const result = selectOfflineHomeworks(history, upcoming);
  assert.equal(result.currentHomework?.sourceLessonId, "new");
  assert.equal(result.currentHomework?.due?.lessonId, "next");
  assert.equal(result.lastHomeworkReview?.sourceLessonId, "old");
  assert.equal(result.lastHomeworkReview?.review?.completionPercent, 70);
});
