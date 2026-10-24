import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const { aqtobeDayKey, lessonResultBrief, sectorProgressAroundLesson } = await import("./student-lesson-result.service.js");

// Plan 2.7: what the student sees as the result of one confirmed lesson.
test("the sector bar shows the lesson's own step: topics mastered before it and by it", () => {
  const lessonAt = new Date("2026-10-20T09:00:00.000Z");
  const plan = {
    id: "plan",
    sequence: 2,
    direction: "Гитара",
    topics: [
      { topicId: "a", masteredAt: new Date("2026-10-01T09:00:00.000Z") }, // earlier lesson
      { topicId: "b", masteredAt: lessonAt },                              // this lesson
      { topicId: "c", masteredAt: null },
      { topicId: "d", masteredAt: null },
    ],
  };
  const progress = sectorProgressAroundLesson({
    plan,
    changes: [
      { topicId: "b", fromPercent: 70, toPercent: 100, occurredAt: lessonAt },
      { topicId: "c", fromPercent: 0, toPercent: 30, occurredAt: lessonAt },
    ],
  });
  assert.deepEqual(progress, { planId: "plan", sequence: 2, direction: "Гитара", fromPercent: 25, toPercent: 50, completed: 2, total: 4 });

  const later = sectorProgressAroundLesson({
    plan: { ...plan, topics: [...plan.topics.slice(0, 2), { topicId: "c", masteredAt: new Date("2026-10-25T09:00:00.000Z") }, plan.topics[3]] },
    changes: [{ topicId: "c", fromPercent: 0, toPercent: 30, occurredAt: lessonAt }],
  });
  assert.equal(later.toPercent, 50, "a topic mastered on a later lesson is not counted for this one");
  assert.equal(later.fromPercent, 50);
});

test("a teacher's bonus counts for the lesson of the same Aqtobe day", () => {
  assert.equal(aqtobeDayKey("2026-10-20T19:30:00.000Z"), "2026-10-21", "evening UTC is already the next day in Aqtobe");
  assert.equal(aqtobeDayKey("2026-10-20T07:00:00.000Z"), "2026-10-20");
});

test("the notification line names the Points, the XP and up to two topics", () => {
  assert.equal(
    lessonResultBrief({ points: 100, xp: 20, topics: [
      { title: "Бой восьмыми", fromPercent: 45, toPercent: 100 },
      { title: "Переходы", fromPercent: null, toPercent: 30 },
      { title: "Третья", fromPercent: 10, toPercent: 20 },
    ] }),
    "+100 баллов · +20 XP · «Бой восьмыми» 45 → 100 % · «Переходы» 0 → 30 % · ещё 1",
  );
  assert.equal(lessonResultBrief({ points: 0, xp: 0, topics: [] }), "");
});
