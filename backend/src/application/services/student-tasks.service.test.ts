import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withTaskState, type UnifiedTask } from "../../domain/unified-task.js";
import { getStudentTasks } from "./student-tasks.service.js";

function task(id: string, source: UnifiedTask["source"], status: UnifiedTask["status"]): UnifiedTask {
  return withTaskState({
    id,
    source,
    kind: "assignment",
    title: id,
    descriptionPreview: "",
    status,
    context: { primary: "", secondary: null, teacherName: null },
    timing: { assignedAt: null, dueAt: null, dueKind: null, overdue: false },
    result: { completionPercent: null, scorePercent: null, reviewComment: null, points: null, coins: null },
    target: { href: "/", actionLabel: "Открыть" },
    updatedAt: "2026-08-24T00:00:00.000Z",
  });
}

const filters = { scope: "active" as const, limit: 50 };

describe("student task aggregation", () => {
  it("returns course and online tasks when CRM is unavailable", async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await getStudentTasks("student", filters, {
        course: async () => [task("course:1", "course", "todo")],
        offline: async () => { throw Object.assign(new Error("private upstream error"), { code: "CRM_TIMEOUT" }); },
        online: async () => [task("online:1", "online", "waiting_review")],
      });
      assert.equal(result.meta.partial, true);
      assert.deepEqual(result.data.items.map((item) => item.id), ["course:1", "online:1"]);
      assert.deepEqual(result.meta.sources.offline, { status: "unavailable", code: "CRM_TIMEOUT" });
      assert.equal(JSON.stringify(result).includes("private upstream error"), false);
    } finally {
      console.error = originalError;
    }
  });

  it("treats a local database source failure as critical", async () => {
    await assert.rejects(() => getStudentTasks("student", filters, {
      course: async () => { throw new Error("database unavailable"); },
      offline: async () => [],
      online: async () => [],
    }), /database unavailable/);
  });

  it("counts before source/status filters and server limit", async () => {
    const result = await getStudentTasks("student", { scope: "active", source: "course", limit: 1 }, {
      course: async () => [task("course:1", "course", "todo"), task("course:2", "course", "todo")],
      offline: async () => [task("offline:1", "offline", "completed")],
      online: async () => [task("online:1", "online", "waiting_review")],
    });
    assert.equal(result.data.items.length, 1);
    assert.equal(result.meta.truncated, true);
    assert.equal(result.data.counts.actionRequired, 2);
    assert.deepEqual(result.data.counts.bySource, { course: 2, offline: 1, online: 1 });
  });
});
