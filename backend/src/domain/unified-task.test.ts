import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  descriptionPreview,
  sortUnifiedTasks,
  unifiedTaskCounts,
  withTaskState,
  type UnifiedTask,
} from "./unified-task.js";

function task(overrides: Partial<UnifiedTask> & Pick<UnifiedTask, "id" | "status">): UnifiedTask {
  return withTaskState({
    id: overrides.id,
    source: overrides.source ?? "course",
    kind: "assignment",
    title: overrides.id,
    descriptionPreview: "",
    status: overrides.status,
    context: { primary: "", secondary: null, teacherName: null },
    timing: { assignedAt: null, dueAt: null, dueKind: null, overdue: false, ...overrides.timing },
    result: { completionPercent: null, scorePercent: null, reviewComment: null, points: null, coins: null },
    target: { href: "/", actionLabel: "Открыть" },
    updatedAt: overrides.updatedAt ?? "2026-08-20T00:00:00.000Z",
  }, new Date("2026-08-24T10:00:00.000Z"));
}

describe("unified task domain", () => {
  it("cuts preview by Unicode characters and normalizes whitespace", () => {
    assert.equal(descriptionPreview("  раз\n\nдва  ", 20), "раз два");
    assert.equal(descriptionPreview("🎸🎸🎸🎸", 3), "🎸🎸…");
  });

  it("marks only exact actionable deadlines as overdue", () => {
    const exact = task({
      id: "online:1",
      status: "todo",
      timing: { assignedAt: null, dueAt: "2026-08-23T10:00:00.000Z", dueKind: "exact", overdue: false },
    });
    const nextLesson = task({
      id: "offline:1",
      status: "todo",
      timing: { assignedAt: null, dueAt: "2026-08-23T10:00:00.000Z", dueKind: "next_lesson", overdue: false },
    });
    assert.equal(exact.timing.overdue, true);
    assert.equal(nextLesson.timing.overdue, false);
  });

  it("sorts revision, overdue, exact, next lesson, no due, review, completed", () => {
    const items = [
      task({ id: "7", status: "completed" }),
      task({ id: "6", status: "waiting_review" }),
      task({ id: "5", status: "todo" }),
      task({ id: "4", status: "todo", timing: { assignedAt: null, dueAt: "2026-08-25T10:00:00.000Z", dueKind: "next_lesson", overdue: false } }),
      task({ id: "3", status: "todo", timing: { assignedAt: null, dueAt: "2026-08-25T10:00:00.000Z", dueKind: "exact", overdue: false } }),
      task({ id: "2", status: "todo", timing: { assignedAt: null, dueAt: "2026-08-23T10:00:00.000Z", dueKind: "exact", overdue: false } }),
      task({ id: "1", status: "needs_revision" }),
    ];
    assert.deepEqual(sortUnifiedTasks(items).map((item) => item.id), ["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("counts active/action/completed and every source before limiting", () => {
    const items = [
      task({ id: "c", status: "todo", source: "course" }),
      task({ id: "o", status: "waiting_review", source: "online" }),
      task({ id: "f", status: "completed", source: "offline" }),
    ];
    assert.deepEqual(unifiedTaskCounts(items), {
      totalActive: 2,
      actionRequired: 1,
      waitingReview: 1,
      needsRevision: 0,
      completed: 1,
      bySource: { course: 1, offline: 1, online: 1 },
    });
  });
});
