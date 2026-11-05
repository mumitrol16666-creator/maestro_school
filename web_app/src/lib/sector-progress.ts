import type { StudentHomeMonthlyPlan } from "@/types/api";

export type SectorTopic = StudentHomeMonthlyPlan["items"][number];
export type SectorTopicFilter = "all" | "working" | "completed";

export function isCurrentSectorTopic(topic: SectorTopic) {
  return topic.state !== "transferred" && topic.state !== "replaced" && topic.status !== "moved";
}

export function sectorTopicStage(topic: SectorTopic) {
  if (topic.status === "completed" || topic.progressPercent === 100) return "completed";
  if (topic.status === "in_progress" || (typeof topic.progressPercent === "number" && topic.progressPercent > 0)) return "working";
  return "planned";
}

/** A count of mastered topics, never an average skill score or exam admission. */
export function sectorProgress(items: SectorTopic[]) {
  const current = items.filter(isCurrentSectorTopic);
  const completed = current.filter(item => sectorTopicStage(item) === "completed").length;
  const working = current.filter(item => sectorTopicStage(item) === "working").length;
  return { current, completed, working, planned: current.length - completed - working, total: current.length,
    percent: current.length ? Math.round(completed / current.length * 100) : 0,
    focus: current.find(item => sectorTopicStage(item) === "working") ?? current.find(item => sectorTopicStage(item) === "planned") ?? null };
}
