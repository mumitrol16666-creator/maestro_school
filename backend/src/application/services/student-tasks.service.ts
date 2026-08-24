import {
  matchesTaskScope,
  sortUnifiedTasks,
  unifiedTaskCounts,
  type UnifiedTask,
  type UnifiedTaskScope,
  type UnifiedTaskSource,
  type UnifiedTaskStatus,
} from "../../domain/unified-task.js";
import { loadCourseTasks } from "./task-sources/course-task.adapter.js";
import { loadOfflineTasks } from "./task-sources/offline-task.adapter.js";
import { loadOnlineTasks } from "./task-sources/online-task.adapter.js";

export type StudentTaskFilters = {
  scope: UnifiedTaskScope;
  source?: UnifiedTaskSource;
  status?: UnifiedTaskStatus;
  limit: number;
};

type SourceState = { status: "ok" } | { status: "unavailable"; code: string };
type TaskSourceLoaders = Record<UnifiedTaskSource, (studentId: string, now: Date) => Promise<UnifiedTask[]>>;

const defaultLoaders: TaskSourceLoaders = {
  course: loadCourseTasks,
  offline: loadOfflineTasks,
  online: loadOnlineTasks,
};

function safeSourceCode(source: UnifiedTaskSource, reason: unknown) {
  const code = typeof reason === "object" && reason && "code" in reason
    ? String((reason as { code?: unknown }).code ?? "")
    : "";
  if (source === "offline" && ["CRM_NOT_LINKED", "CRM_TIMEOUT", "CRM_UNAVAILABLE"].includes(code)) return code;
  return `${source.toUpperCase()}_TASKS_UNAVAILABLE`;
}

export async function getStudentTasks(
  studentId: string,
  filters: StudentTaskFilters,
  loaders: TaskSourceLoaders = defaultLoaders,
) {
  const generatedAt = new Date();
  const startedAt = Date.now();
  const sourcePromises = {
    course: loaders.course(studentId, generatedAt),
    offline: loaders.offline(studentId, generatedAt),
    online: loaders.online(studentId, generatedAt),
  } as const;
  const sourceNames = Object.keys(sourcePromises) as UnifiedTaskSource[];
  const settled = await Promise.allSettled(sourceNames.map((source) => sourcePromises[source]));
  const sources = {} as Record<UnifiedTaskSource, SourceState>;
  const allTasks: UnifiedTask[] = [];

  settled.forEach((result, index) => {
    const source = sourceNames[index];
    if (result.status === "fulfilled") {
      sources[source] = { status: "ok" };
      allTasks.push(...result.value);
    } else {
      if (source !== "offline") throw result.reason;
      sources[source] = { status: "unavailable", code: safeSourceCode(source, result.reason) };
      console.error(`[student-tasks] ${source} adapter unavailable`, {
        code: safeSourceCode(source, result.reason),
        elapsedMs: Date.now() - startedAt,
      });
    }
  });

  const counts = unifiedTaskCounts(allTasks);
  const filtered = sortUnifiedTasks(allTasks.filter((task) => (
    matchesTaskScope(task, filters.scope)
    && (!filters.source || task.source === filters.source)
    && (!filters.status || task.status === filters.status)
  )));
  const truncated = filtered.length > filters.limit;

  return {
    data: { items: filtered.slice(0, filters.limit), counts },
    meta: {
      partial: Object.values(sources).some((source) => source.status === "unavailable"),
      truncated,
      sources,
      generatedAt: generatedAt.toISOString(),
    },
  };
}
