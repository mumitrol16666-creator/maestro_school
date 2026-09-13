import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareLegacyDecision, type LegacyDecisionEvent } from "./legacy-homework-resolution.js";
import { mapOfflineTask } from "../application/services/task-sources/offline-task.adapter.js";
import { matchesTaskScope, unifiedTaskCounts } from "./unified-task.js";

const event: LegacyDecisionEvent = { decision: "accepted", comment: "", actorId: "teacher", actorName: "Teacher", at: "2026-09-13T08:00:00Z", requestKey: "one", expectedRevision: 0 };
test("legacy decision requires a reason for continued or obsolete work", () => {
  for (const decision of ["continue", "obsolete"] as const) assert.throws(() => prepareLegacyDecision(null, { ...event, decision, comment: "  " }));
  assert.equal(prepareLegacyDecision(null, event).revision, 1);
});
test("exact retries do not append history, changed payloads and stale versions conflict", () => {
  const first = prepareLegacyDecision(null, event);
  const current = { ...first, decision: event.decision, comment: "" };
  assert.equal(prepareLegacyDecision(current, event).idempotent, true);
  assert.equal(prepareLegacyDecision(current, event).history.length, 1);
  for (const change of [{ comment: "changed" }, { actorId: "other" }, { decision: "obsolete" as const }, { expectedRevision: 1 }]) {
    assert.throws(() => prepareLegacyDecision(current, { ...event, ...change }), { code: "HOMEWORK_IDEMPOTENCY_CONFLICT" });
  }
  assert.throws(() => prepareLegacyDecision(current, { ...event, requestKey: "two" }), { code: "HOMEWORK_STALE_VERSION" });
  const next = prepareLegacyDecision(current, { ...event, decision: "continue", comment: "Повторить припев", expectedRevision: 1, requestKey: "two" });
  assert.equal(next.revision, 2);
  assert.equal(next.history.length, 2);
});
test("old decisions preserve lesson rewards and never invent mastery percentages", () => {
  for (const [decision, status] of [["accepted", "completed"], ["continue", "todo"], ["obsolete", "archived"]] as const) {
    const mapped = mapOfflineTask({ crmClassId: "old", title: "Урок", date: "2026-08-27", status: "completed", homework: "Припев", homeworkResult: { status: "partial", completionPercent: 80 }, lessonPointsAwarded: 100, legacyResolution: { decision, comment: "Решение", updatedAt: event.at } }, [])!;
    assert.equal(mapped.status, status);
    assert.equal(mapped.result.points, 100);
    assert.equal(mapped.result.completionPercent, null);
    assert.equal(mapped.result.reviewComment, "Решение");
    assert.equal(mapped.updatedAt, "2026-09-13T08:00:00.000Z");
    assert.equal(mapped.legacyDecision, decision);
    if (decision === "obsolete") {
      assert.equal(mapped.actionRequired, false);
      assert.equal(matchesTaskScope(mapped, "active"), false);
      assert.equal(matchesTaskScope(mapped, "completed"), false);
      assert.equal(matchesTaskScope(mapped, "archived"), true);
      assert.equal(unifiedTaskCounts([mapped]).completed, 0);
      assert.equal(unifiedTaskCounts([mapped]).archived, 1);
    }
  }
});
