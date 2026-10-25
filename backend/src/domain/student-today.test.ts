import assert from "node:assert/strict";
import test from "node:test";
import { buildStudentToday } from "./student-today.js";

const now = new Date("2026-10-24T05:00:00.000Z"); // 10:00 in Aqtobe, Saturday

test("the home opens with the nearest scheduled lesson and marks today and tomorrow", () => {
  const today = buildStudentToday({
    now,
    tasks: [],
    upcomingLessons: [
      { crmClassId: "later", title: "Урок", date: "2026-10-27T07:00:00.000Z", startTime: "16:00", endTime: "17:00", status: "scheduled" },
      { crmClassId: "cancelled", title: "Урок", date: "2026-10-24T07:00:00.000Z", startTime: "12:00", endTime: "13:00", status: "cancelled" },
      { crmClassId: "today", title: "Урок", date: "2026-10-24T07:00:00.000Z", startTime: "15:00", endTime: "16:00", status: "scheduled" },
    ],
  });
  assert.equal(today.nextLesson?.crmClassId, "today");
  assert.equal(today.nextLesson?.isToday, true);
  const tomorrow = buildStudentToday({ now, tasks: [], upcomingLessons: [
    { crmClassId: "t", title: "Урок", date: "2026-10-24T19:30:00.000Z", startTime: "10:00", endTime: "11:00" },
  ] });
  assert.equal(tomorrow.nextLesson?.isTomorrow, true, "an evening UTC date is tomorrow in Aqtobe");
  assert.equal(buildStudentToday({ now, tasks: [], upcomingLessons: [] }).nextLesson, null);
});

test("tasks before the lesson: revisions first, then homework, then theory tests, three at most", () => {
  const today = buildStudentToday({
    now,
    upcomingLessons: [],
    tasks: [
      { id: "theory", title: "Тест", status: "todo", source: "theory" },
      { id: "done", title: "Сделано", status: "completed", source: "school" },
      { id: "hw", title: "ДЗ", status: "todo", source: "school" },
      { id: "fix", title: "Доработать", status: "needs_revision", source: "school" },
      { id: "hw2", title: "ДЗ 2", status: "todo", source: "school" },
    ],
  });
  assert.deepEqual(today.tasks.map((task) => task.id), ["fix", "hw", "hw2"]);
  assert.equal(today.tasksTotal, 4);
});
