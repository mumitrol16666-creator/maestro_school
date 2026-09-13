import { descriptionPreview, withTaskState, type UnifiedTask, type UnifiedTaskStatus } from "../../../domain/unified-task.js";
import { learningHomeworkV2Enabled, listStudentLearningHomeworkAssignments } from "../learning-homework-v2.service.js";
import { loadOfflineTasks } from "./offline-task.adapter.js";

type Assignment = Awaited<ReturnType<typeof listStudentLearningHomeworkAssignments>>[number];
export type SchoolTaskBatch = { tasks: UnifiedTask[]; unavailableCode?: string };
const statuses: Record<Assignment["state"], UnifiedTaskStatus> = {
  assigned: "todo", waiting_review: "waiting_review", revision: "needs_revision",
  accepted: "completed", accepted_with_comment: "completed",
};

export function mapLearningHomeworkTask(assignment: Assignment, now = new Date()): UnifiedTask {
  const attempt = assignment.latestAttempt;
  const status = statuses[assignment.state];
  return withTaskState({
    id: `learning-homework:${assignment.recipientId}`,
    source: "offline", provenance: "learning_homework_v2", kind: "assignment",
    title: assignment.topic.title, descriptionPreview: descriptionPreview(assignment.instructions), status,
    context: { primary: assignment.topic.direction.title, secondary: null, teacherName: assignment.teacherName || null },
    timing: { assignedAt: assignment.assignedAt.toISOString(), dueAt: assignment.dueAt?.toISOString() ?? null,
      dueKind: assignment.dueAt ? "exact" : null, overdue: false },
    // Acceptance of homework is not a topic mastery percentage or proof of a reward.
    result: { completionPercent: null, scorePercent: null, reviewComment: attempt?.review?.comment ?? null, points: null, coins: null },
    target: { href: `/tasks/school/${encodeURIComponent(assignment.id)}`, actionLabel: "Открыть" },
    updatedAt: (attempt?.review?.reviewedAt ?? attempt?.submittedAt ?? assignment.assignedAt).toISOString(),
  }, now);
}

export function mergeSchoolTasks(legacy: UnifiedTask[], assignments: Assignment[], now = new Date()) {
  // One old report aggregates a lesson; v2 holds the individual assignments from it.
  // Match by stable lesson ID only. Similar titles do not establish identity.
  const representedLessons = new Set(assignments.map(item => item.sourceLessonId).filter(Boolean));
  return [
    ...assignments.map(item => mapLearningHomeworkTask(item, now)),
    ...legacy.filter(task => !representedLessons.has(task.id.replace(/^offline:/, ""))),
  ];
}

async function loadAssignments(studentId: string) {
  if (!learningHomeworkV2Enabled()) return [];
  try {
    return await listStudentLearningHomeworkAssignments(studentId, { linkRecipients: false });
  } catch (reason) {
    // Course-only users need not have a school profile.
    if ((reason as { code?: string })?.code === "CRM_NOT_LINKED") return [];
    throw reason;
  }
}

export async function loadSchoolTasks(studentId: string, now = new Date(), loaders = {
  legacy: loadOfflineTasks,
  assignments: loadAssignments,
}): Promise<SchoolTaskBatch> {
  const [legacy, assignments] = await Promise.allSettled([
    loaders.legacy(studentId, now), loaders.assignments(studentId),
  ]);
  // Without the canonical source we cannot safely deduplicate or assert statuses.
  if (assignments.status === "rejected") throw assignments.reason;
  const tasks = mergeSchoolTasks(legacy.status === "fulfilled" ? legacy.value : [], assignments.value, now);
  if (legacy.status === "fulfilled") return { tasks };
  const code = (legacy.reason as { code?: string })?.code;
  return { tasks, unavailableCode: code && ["CRM_NOT_LINKED", "CRM_TIMEOUT", "CRM_UNAVAILABLE"].includes(code) ? code : "OFFLINE_TASKS_UNAVAILABLE" };
}
