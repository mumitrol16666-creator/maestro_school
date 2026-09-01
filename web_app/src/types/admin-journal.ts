export type AdminJournalType =
  | "product_improvement"
  | "complaint"
  | "moderation"
  | "crm_sync"
  | "stuck_homework"
  | "stuck_report"
  | "reward_correction"
  | "parent_access";

export type AdminJournalSeverity = "low" | "normal" | "high" | "critical";
export type AdminJournalStatus = "new" | "in_progress" | "resolved" | "dismissed";
export type AdminJournalSource = "application" | "crm" | "system" | "moderation";

export type AdminJournalAction = {
  id: string;
  action: string;
  fromStatus: AdminJournalStatus | null;
  toStatus: AdminJournalStatus | null;
  note: string | null;
  actor: { id: string; displayName: string } | null;
  createdAt: string;
};

export type AdminJournalEntry = {
  id: string;
  sourceKey: string;
  type: AdminJournalType;
  severity: AdminJournalSeverity;
  source: AdminJournalSource;
  linkedEntity: { type: string; id: string };
  title: string;
  summary: string;
  status: AdminJournalStatus;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  ageMinutes: number;
  actions: AdminJournalAction[];
};

export type AdminJournalList = {
  items: AdminJournalEntry[];
  total: number;
  counts: Record<AdminJournalStatus, number>;
  generatedAt: string;
};

export type AdminJournalFilters = {
  type?: AdminJournalType;
  severity?: AdminJournalSeverity;
  source?: AdminJournalSource;
  status?: AdminJournalStatus;
  limit?: number;
};
