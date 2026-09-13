export type UnifiedTaskSource = "course" | "offline" | "online";
export type UnifiedTaskStatus = "todo" | "waiting_review" | "needs_revision" | "completed" | "archived";
export type UnifiedTaskScope = "active" | "completed" | "all" | "archived";

export type UnifiedTask = {
  id: string;
  source: UnifiedTaskSource;
  provenance?: "legacy_offline" | "learning_homework_v2";
  legacyDecision?: "accepted" | "continue" | "obsolete";
  kind: "assignment" | "test";
  title: string;
  descriptionPreview: string;
  status: UnifiedTaskStatus;
  actionRequired: boolean;
  context: { primary: string; secondary: string | null; teacherName: string | null };
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
  target: { href: string; actionLabel: string };
  updatedAt: string;
};

export type UnifiedTaskCounts = {
  totalActive: number;
  actionRequired: number;
  waitingReview: number;
  needsRevision: number;
  completed: number;
  archived?: number;
  bySource: Record<UnifiedTaskSource, number>;
};

export type UnifiedTasksData = { items: UnifiedTask[]; counts: UnifiedTaskCounts; filteredCounts?: UnifiedTaskCounts };
export type UnifiedTasksMeta = {
  partial: boolean;
  truncated: boolean;
  sources: Record<UnifiedTaskSource, { status: "ok" } | { status: "unavailable"; code: string }>;
  generatedAt: string;
};

export type UnifiedTaskFilters = {
  scope?: UnifiedTaskScope;
  source?: UnifiedTaskSource;
  status?: UnifiedTaskStatus;
  limit?: number;
};
