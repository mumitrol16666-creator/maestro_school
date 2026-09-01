import { upsertAdminJournalEntry } from "./admin-journal.service.js";

export async function submitImprovementSuggestion(params: {
  actorId: string;
  actorRole: string;
  idempotencyKey: string;
  title: string;
  details: string;
  currentPath?: string | null;
}) {
  const entry = await upsertAdminJournalEntry({
    sourceKey: `product-improvement:${params.actorId}:${params.idempotencyKey}`,
    type: "product_improvement",
    severity: "normal",
    source: "application",
    linkedEntityType: "user",
    linkedEntityId: params.actorId,
    title: params.title.trim(),
    summary: params.details.trim(),
    actorId: params.actorId,
    payload: {
      actorRole: params.actorRole,
      currentPath: params.currentPath?.trim() || null,
    },
  });

  return {
    id: entry.id,
    status: entry.status,
  };
}
