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
import { loadSchoolTasks, type SchoolTaskBatch } from "./task-sources/school-task.adapter.js";
import { loadOnlineTasks } from "./task-sources/online-task.adapter.js";

export type StudentTaskFilters = {
  scope: UnifiedTaskScope;
  source?: UnifiedTaskSource;
  status?: UnifiedTaskStatus;
  limit: number;
};

type SourceState = { status: "ok" } | { status: "unavailable"; code: string };
type TaskSourceLoaders = Record<UnifiedTaskSource, (studentId: string, now: Date) => Promise<UnifiedTask[] | SchoolTaskBatch>>;

const defaultLoaders: TaskSourceLoaders = {
  course: loadCourseTasks,
  offline: loadSchoolTasks,
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
      const batch = Array.isArray(result.value) ? { tasks: result.value } : result.value;
      sources[source] = batch.unavailableCode
        ? { status: "unavailable", code: batch.unavailableCode } : { status: "ok" };
      allTasks.push(...batch.tasks);
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
  const filteredCounts = unifiedTaskCounts(allTasks.filter(task => !filters.source || task.source === filters.source));
  const filtered = sortUnifiedTasks(allTasks.filter((task) => (
    matchesTaskScope(task, filters.scope)
    && (!filters.source || task.source === filters.source)
    && (!filters.status || task.status === filters.status)
  )));
  const truncated = filtered.length > filters.limit;

  return {
    data: { items: filtered.slice(0, filters.limit), counts, filteredCounts },
    meta: {
      partial: Object.values(sources).some((source) => source.status === "unavailable"),
      truncated,
      sources,
      generatedAt: generatedAt.toISOString(),
    },
  };
}
