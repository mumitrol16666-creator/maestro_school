import { apiRequest } from "@/lib/api-client";
import type {
  AdminJournalEntry,
  AdminJournalFilters,
  AdminJournalList,
  AdminJournalStatus,
} from "@/types/admin-journal";

export const adminJournalApi = {
  list(filters: AdminJournalFilters = {}) {
    const query = new URLSearchParams();
    if (filters.type) query.set("type", filters.type);
    if (filters.severity) query.set("severity", filters.severity);
    if (filters.source) query.set("source", filters.source);
    if (filters.status) query.set("status", filters.status);
    if (filters.limit) query.set("limit", String(filters.limit));
    const suffix = query.toString();
    return apiRequest<AdminJournalList>(`/admin/journal${suffix ? `?${suffix}` : ""}`);
  },
  changeStatus(entryId: string, input: {
    status: AdminJournalStatus;
    resolution?: string | null;
    idempotencyKey: string;
  }) {
    return apiRequest<AdminJournalEntry>(`/admin/journal/${entryId}/status`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
};
