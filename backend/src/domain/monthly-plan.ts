export type MonthlyPlanItemStatus = "planned" | "in_progress" | "completed";

export type MonthlyPlanItem = {
  id: string;
  title: string;
  status: MonthlyPlanItemStatus;
};

export type MonthlyPlanProgress = {
  completed: number;
  inProgress: number;
  total: number;
  percent: number;
};

export type MonthlyPlanSnapshot = {
  schemaVersion: 1;
  goal: string;
  expectedResult: string;
  checkpoint: string;
  items: MonthlyPlanItem[];
  progress: MonthlyPlanProgress;
};

function normalizeStatus(value: unknown): MonthlyPlanItemStatus {
  if (value === "completed" || value === "in_progress") return value;
  return "planned";
}

export function normalizeMonthlyPlanItems(value: unknown): MonthlyPlanItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: MonthlyPlanItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title, status: normalizeStatus(raw.status) });
  }
  return items;
}

export function calculateMonthlyPlanProgress(items: MonthlyPlanItem[]): MonthlyPlanProgress {
  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  const inProgress = items.filter((item) => item.status === "in_progress").length;
  return {
    completed,
    inProgress,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function buildMonthlyPlanSnapshot(input: {
  goal: string;
  expectedResult?: string | null;
  checkpoint?: string | null;
  items: unknown;
}): MonthlyPlanSnapshot {
  const items = normalizeMonthlyPlanItems(input.items);
  return {
    schemaVersion: 1,
    goal: input.goal.trim(),
    expectedResult: input.expectedResult?.trim() ?? "",
    checkpoint: input.checkpoint?.trim() ?? "",
    items,
    progress: calculateMonthlyPlanProgress(items),
  };
}

export function parseMonthlyPlanSnapshot(value: unknown): MonthlyPlanSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || typeof raw.goal !== "string") return null;
  return buildMonthlyPlanSnapshot({
    goal: raw.goal,
    expectedResult: typeof raw.expectedResult === "string" ? raw.expectedResult : "",
    checkpoint: typeof raw.checkpoint === "string" ? raw.checkpoint : "",
    items: raw.items,
  });
}
