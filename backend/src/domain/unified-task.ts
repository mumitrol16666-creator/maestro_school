export type UnifiedTaskSource = "course" | "offline" | "online";
export type UnifiedTaskStatus = "todo" | "waiting_review" | "needs_revision" | "completed";
export type UnifiedTaskScope = "active" | "completed" | "all";

export type UnifiedTask = {
  id: string;
  source: UnifiedTaskSource;
  kind: "assignment" | "test";
  title: string;
  descriptionPreview: string;
  status: UnifiedTaskStatus;
  actionRequired: boolean;
  context: {
    primary: string;
    secondary: string | null;
    teacherName: string | null;
  };
  timing: {
    assignedAt: string | null;
    dueAt: string | null;
    dueKind: "exact" | "next_lesson" | null;
    overdue: boolean;
  };
  result: {
    completionPercent: number | null;
    scorePercent: number | null;
    reviewComment: string | null;
    points: number | null;
    coins: number | null;
  };
  target: {
    href: string;
    actionLabel: string;
  };
  updatedAt: string;
};

export type UnifiedTaskCounts = {
  totalActive: number;
  actionRequired: number;
  waitingReview: number;
  needsRevision: number;
  completed: number;
  bySource: Record<UnifiedTaskSource, number>;
};

export function isActionRequired(status: UnifiedTaskStatus) {
  return status === "todo" || status === "needs_revision";
}

export function descriptionPreview(value: string | null | undefined, limit = 240) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;
  return `${characters.slice(0, Math.max(0, limit - 1)).join("").trimEnd()}…`;
}

export function taskActionLabel(status: UnifiedTaskStatus, source: UnifiedTaskSource) {
  if (status === "needs_revision") return "Доработать";
  if (status === "waiting_review") return "Открыть";
  if (status === "completed") return "Посмотреть результат";
  return source === "offline" ? "Посмотреть" : "Выполнить";
}

export function withTaskState<T extends Omit<UnifiedTask, "actionRequired">>(
  task: T,
  now = new Date(),
): UnifiedTask {
  const actionRequired = isActionRequired(task.status);
  const overdue = Boolean(
    actionRequired
    && task.timing.dueKind === "exact"
    && task.timing.dueAt
    && new Date(task.timing.dueAt).getTime() < now.getTime(),
  );
  return {
    ...task,
    actionRequired,
    timing: { ...task.timing, overdue },
  };
}

function priority(task: UnifiedTask) {
  if (task.status === "needs_revision") return 0;
  if (task.status === "todo" && task.timing.overdue) return 1;
  if (task.status === "todo" && task.timing.dueKind === "exact") return 2;
  if (task.status === "todo" && task.timing.dueKind === "next_lesson") return 3;
  if (task.status === "todo") return 4;
  if (task.status === "waiting_review") return 5;
  return 6;
}

export function sortUnifiedTasks(tasks: UnifiedTask[]) {
  return [...tasks].sort((left, right) => {
    const priorityDelta = priority(left) - priority(right);
    if (priorityDelta) return priorityDelta;

    const leftDue = left.timing.dueAt ? new Date(left.timing.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.timing.dueAt ? new Date(right.timing.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;

    const updatedDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    return updatedDelta || left.id.localeCompare(right.id);
  });
}

export function unifiedTaskCounts(tasks: UnifiedTask[]): UnifiedTaskCounts {
  return {
    totalActive: tasks.filter((task) => task.status !== "completed").length,
    actionRequired: tasks.filter((task) => task.actionRequired).length,
    waitingReview: tasks.filter((task) => task.status === "waiting_review").length,
    needsRevision: tasks.filter((task) => task.status === "needs_revision").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    bySource: {
      course: tasks.filter((task) => task.source === "course").length,
      offline: tasks.filter((task) => task.source === "offline").length,
      online: tasks.filter((task) => task.source === "online").length,
    },
  };
}

export function matchesTaskScope(task: UnifiedTask, scope: UnifiedTaskScope) {
  if (scope === "all") return true;
  if (scope === "completed") return task.status === "completed";
  return task.status !== "completed";
}
