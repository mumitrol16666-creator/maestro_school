import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyWeekDigest } from "./family-digest.js";

const now = new Date("2026-10-25T06:00:00.000Z");

test("the parent's week counts confirmed lessons of the last seven days and names the moved topics", () => {
  const digest = buildFamilyWeekDigest({
    childName: "Казыбаев Камбар",
    now,
    visits: [
      { crmClassId: "a", date: "2026-10-23T07:00:00.000Z", confirmed: true, attendance: "present", topic: "Бой восьмыми", summary: null },
      { crmClassId: "b", date: "2026-10-20T07:00:00.000Z", confirmed: true, attendance: "absent", topic: null, summary: null },
      { crmClassId: "old", date: "2026-10-10T07:00:00.000Z", confirmed: true, attendance: "present", topic: "Старое", summary: null },
      { crmClassId: "pending", date: "2026-10-24T07:00:00.000Z", confirmed: false, attendance: "pending", topic: null, summary: null },
    ],
    topicMoves: [
      { crmClassId: "a", title: "Бой восьмыми", fromPercent: 45, toPercent: 60 },
      { crmClassId: "old", title: "Старое", fromPercent: 0, toPercent: 100 },
    ],
  });
  assert.equal(digest.lessons, 2);
  assert.equal(digest.attended, 1);
  assert.deepEqual(digest.topics, [{ title: "Бой восьмыми", fromPercent: 45, toPercent: 60, mastered: false }]);
  assert.equal(digest.supportPhrase, "Камбар продвинул «Бой восьмыми» до 60 % — скажите ему об этом.");
  assert.ok(digest.tip.length > 10);
});

test("without lessons the digest is empty but still carries a tip", () => {
  const digest = buildFamilyWeekDigest({ childName: "Алина", now, visits: [], topicMoves: [] });
  assert.equal(digest.lessons, 0);
  assert.equal(digest.supportPhrase, null);
  assert.ok(digest.tip);
});
