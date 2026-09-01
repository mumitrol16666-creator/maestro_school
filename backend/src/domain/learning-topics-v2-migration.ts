import {
  parseMonthlyPlanSnapshot,
  type MonthlyPlanItemStatus,
} from "./monthly-plan.js";

export type LegacyLearningPlanKind = "student" | "group";

export type LegacyLearningPlanInput = {
  kind: LegacyLearningPlanKind;
  id: string;
  ownerId: string;
  teacherUserId: string;
  month: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  materials?: unknown;
  publishedSnapshot: unknown;
  publishedAt: Date | null;
  draftRevision: number;
  publishedRevision: number;
};

export type LearningTopicMigrationCandidate = {
  legacyItemId: string;
  sourceKey: string;
  title: string;
  progressPercent: number | null;
  legacyStatus: MonthlyPlanItemStatus;
  masteryRewardSourceKey: string | null;
  masteredAt: Date | null;
  progressSourceKey: string | null;
  sortOrder: number;
};

export type LearningPlanMigrationCandidate = {
  sourceKey: string;
  kind: LegacyLearningPlanKind;
  legacyPlanId: string;
  ownerId: string;
  teacherUserId: string;
  directionId: string;
  month: string;
  version: number;
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  materials: unknown[];
  publishedAt: Date;
  topics: LearningTopicMigrationCandidate[];
  completionRewardSourceKey: string | null;
  completedAt: Date | null;
  lockedAt: Date | null;
};

export type LearningPlanMigrationIssueReason =
  | "direction_mapping_missing"
  | "direction_mapping_invalid"
  | "invalid_month"
  | "invalid_published_revision"
  | "published_revision_diverged"
  | "invalid_published_snapshot"
  | "invalid_snapshot_items"
  | "topic_title_too_long"
  | "target_collision";

export type LearningPlanMigrationIssue = {
  sourceKey: string;
  reason: LearningPlanMigrationIssueReason;
};

export type LearningPlanMigrationPlan = {
  candidates: LearningPlanMigrationCandidate[];
  unresolved: LearningPlanMigrationIssue[];
  skippedUnpublished: string[];
  summary: {
    legacyPlans: number;
    candidates: number;
    topics: number;
    unresolved: number;
    skippedUnpublished: number;
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function legacyLearningPlanSourceKey(kind: LegacyLearningPlanKind, id: string) {
  return `${kind}-monthly-plan:${id}`;
}

function rawSnapshotItems(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object") return null;
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? items : null;
}

function topicProgress(status: MonthlyPlanItemStatus): number | null {
  if (status === "completed") return 100;
  if (status === "planned") return 0;
  // The legacy model only stored "in progress", not a numeric percentage.
  return null;
}

function buildCandidate(
  input: LegacyLearningPlanInput,
  directionMap: Readonly<Record<string, string>>,
): LearningPlanMigrationCandidate | LearningPlanMigrationIssue | "unpublished" {
  const sourceKey = legacyLearningPlanSourceKey(input.kind, input.id);

  if (!input.publishedAt || !input.publishedSnapshot) return "unpublished";
  if (!MONTH_PATTERN.test(input.month)) return { sourceKey, reason: "invalid_month" };
  if (input.publishedRevision <= 0) {
    return { sourceKey, reason: "invalid_published_revision" };
  }
  if (input.draftRevision !== input.publishedRevision) {
    // Only goal and items were snapshotted by the legacy model. Copying the
    // current metadata after a later draft edit would silently rewrite history.
    return { sourceKey, reason: "published_revision_diverged" };
  }

  const snapshot = parseMonthlyPlanSnapshot(input.publishedSnapshot);
  const rawItems = rawSnapshotItems(input.publishedSnapshot);
  if (!snapshot || !rawItems) {
    return { sourceKey, reason: "invalid_published_snapshot" };
  }
  if (snapshot.items.length !== rawItems.length) {
    return { sourceKey, reason: "invalid_snapshot_items" };
  }
  if (snapshot.items.some((item) => item.title.length > 1000)) {
    return { sourceKey, reason: "topic_title_too_long" };
  }

  const directionId = directionMap[sourceKey]?.trim();
  if (!directionId) return { sourceKey, reason: "direction_mapping_missing" };
  if (!UUID_PATTERN.test(directionId)) {
    return { sourceKey, reason: "direction_mapping_invalid" };
  }

  const topics = snapshot.items.map((item, sortOrder) => {
    const topicSourceKey = `${sourceKey}:item:${item.id}`;
    const progressPercent = topicProgress(item.status);
    const mastered = item.status === "completed";
    return {
      legacyItemId: item.id,
      sourceKey: topicSourceKey,
      title: item.title,
      progressPercent,
      legacyStatus: item.status,
      masteryRewardSourceKey: mastered
        ? `${topicSourceKey}:mastery:blocked-before-cutover`
        : null,
      masteredAt: mastered ? input.publishedAt : null,
      progressSourceKey: progressPercent === null
        ? null
        : `${topicSourceKey}:progress:migration`,
      sortOrder,
    };
  });
  const completed = topics.length > 0
    && topics.every((topic) => topic.progressPercent === 100);

  return {
    sourceKey,
    kind: input.kind,
    legacyPlanId: input.id,
    ownerId: input.ownerId,
    teacherUserId: input.teacherUserId,
    directionId,
    month: input.month,
    version: input.publishedRevision,
    goal: snapshot.goal,
    expectedResult: input.expectedResult.trim(),
    skills: input.skills.trim(),
    checkpoint: input.checkpoint.trim(),
    note: input.note.trim(),
    materials: input.kind === "group" && Array.isArray(input.materials)
      ? input.materials
      : [],
    publishedAt: input.publishedAt,
    topics,
    completionRewardSourceKey: completed
      ? `${sourceKey}:completion:blocked-before-cutover`
      : null,
    completedAt: completed ? input.publishedAt : null,
    lockedAt: completed ? input.publishedAt : null,
  };
}

export function buildLearningTopicsV2MigrationPlan(
  inputs: readonly LegacyLearningPlanInput[],
  directionMap: Readonly<Record<string, string>>,
): LearningPlanMigrationPlan {
  const candidates: LearningPlanMigrationCandidate[] = [];
  const unresolved: LearningPlanMigrationIssue[] = [];
  const skippedUnpublished: string[] = [];

  for (const input of [...inputs].sort((a, b) => (
    legacyLearningPlanSourceKey(a.kind, a.id)
      .localeCompare(legacyLearningPlanSourceKey(b.kind, b.id))
  ))) {
    const result = buildCandidate(input, directionMap);
    if (result === "unpublished") {
      skippedUnpublished.push(legacyLearningPlanSourceKey(input.kind, input.id));
    } else if ("reason" in result) {
      unresolved.push(result);
    } else {
      candidates.push(result);
    }
  }

  const targetCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const targetKey = [
      candidate.kind,
      candidate.ownerId,
      candidate.directionId,
      candidate.month,
    ].join(":");
    targetCounts.set(targetKey, (targetCounts.get(targetKey) ?? 0) + 1);
  }

  const safeCandidates = candidates.filter((candidate) => {
    const targetKey = [
      candidate.kind,
      candidate.ownerId,
      candidate.directionId,
      candidate.month,
    ].join(":");
    if ((targetCounts.get(targetKey) ?? 0) === 1) return true;
    unresolved.push({ sourceKey: candidate.sourceKey, reason: "target_collision" });
    return false;
  });

  return {
    candidates: safeCandidates,
    unresolved,
    skippedUnpublished,
    summary: {
      legacyPlans: inputs.length,
      candidates: safeCandidates.length,
      topics: safeCandidates.reduce((sum, candidate) => sum + candidate.topics.length, 0),
      unresolved: unresolved.length,
      skippedUnpublished: skippedUnpublished.length,
    },
  };
}
