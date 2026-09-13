import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortUnifiedTasks } from "../../../domain/unified-task.js";
import { mapOfflineTask } from "./offline-task.adapter.js";
import { loadSchoolTasks, mapLearningHomeworkTask, mergeSchoolTasks } from "./school-task.adapter.js";

type Assignment = Parameters<typeof mapLearningHomeworkTask>[0];
const now = new Date("2026-09-13T04:00:00Z");
function assignment(extra: Partial<Assignment> = {}): Assignment {
  return {
    id: "assignment", recipientId: "recipient", model: "learning_homework_v2", state: "assigned",
    currentCycle: 1, acceptedAt: null, sourceLessonId: "lesson", dueAt: null, assignedAt: now,
    teacherName: "Преподаватель", instructions: "Переходы под метроном",
    topic: { id: "topic", title: "Am–E", masteryCriteria: "10 переходов", scope: "student", direction: { id: "guitar", title: "Гитара", crmDirectionId: null } },
    materials: [], latestAttempt: null, attempts: [], ...extra,
  };
}
function legacy(id = "lesson") {
  return mapOfflineTask({ crmClassId: id, title: "Урок", topic: "Am–E", date: "2026-08-01", status: "completed", homework: "Переходы", homeworkReview: { status: "partial", completionPercent: 80 } }, [], now)!;
}

describe("canonical school task list", () => {
  it("maps all recipient states without inventing percentages or rewards", () => {
    for (const [state, status, action] of [
      ["assigned", "todo", true], ["waiting_review", "waiting_review", false],
      ["revision", "needs_revision", true], ["accepted", "completed", false],
      ["accepted_with_comment", "completed", false],
    ] as const) {
      const task = mapLearningHomeworkTask(assignment({ state }), now);
      assert.equal(task.status, status);
      assert.equal(task.actionRequired, action);
      assert.equal(task.result.completionPercent, null);
      assert.equal(task.result.points, null);
      assert.equal(task.target.href, "/tasks/school/assignment");
    }
  });
  it("keeps every topic of one lesson once, suppresses its legacy aggregate only", () => {
    const result = mergeSchoolTasks([legacy(), legacy("unrelated")], [assignment(), assignment({ id: "second", recipientId: "second-recipient" })], now);
    assert.deepEqual(result.map(t => t.id), ["learning-homework:recipient", "learning-homework:second-recipient", "offline:unrelated"]);
    assert.equal(result.filter(t => t.title === "Am–E").length, 3);
  });
  it("an accepted v2 task cannot reappear through an old partial grade", () => {
    const result = mergeSchoolTasks([legacy()], [assignment({ state: "accepted" })], now);
    assert.equal(result.length, 1);
    assert.equal(result[0].actionRequired, false);
  });
  it("uses the real review and explicit deadline", () => {
    const item = assignment({ state: "revision", dueAt: new Date("2026-09-12T12:00:00Z"), latestAttempt: {
      id: "attempt", attemptNumber: 1, cycleNumber: 1, versionInCycle: 1, submissionMode: "materials", text: null,
      materials: [], status: "revision", previousAttemptId: null, submittedAt: now,
      review: { id: "review", decision: "revision", comment: "Не ускоряйся", reviewedAt: now, reviewerName: "Учитель" },
    } });
    const task = mapLearningHomeworkTask(item, now);
    assert.equal(task.timing.overdue, true);
    assert.equal(task.result.reviewComment, "Не ускоряйся");
    assert.equal(task.updatedAt, now.toISOString());
  });
  it("retains current assignments if CRM is unavailable, marks the list partial", async () => {
    const batch = await loadSchoolTasks("student", now, {
      legacy: async () => { throw Object.assign(new Error("private"), { code: "CRM_TIMEOUT" }); },
      assignments: async () => [assignment()],
    });
    assert.equal(batch.tasks[0].id, "learning-homework:recipient");
    assert.equal(batch.unavailableCode, "CRM_TIMEOUT");
    assert.equal(JSON.stringify(batch).includes("private"), false);
  });
  it("does not present legacy statuses as complete when canonical loading fails", async () => {
    await assert.rejects(loadSchoolTasks("student", now, {
      legacy: async () => [legacy()], assignments: async () => { throw new Error("database unavailable"); },
    }), /database unavailable/);
  });
  it("preserves legacy tasks when no canonical homework exists", () => {
    assert.deepEqual(mergeSchoolTasks([legacy()], [], now), [legacy()]);
  });
  it("prioritizes explicit current assignments over historical partial grades", () => {
    assert.equal(sortUnifiedTasks([legacy(), mapLearningHomeworkTask(assignment(), now)])[0].provenance, "learning_homework_v2");
  });
});
