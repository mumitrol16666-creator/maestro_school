import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeDateTime } from "../../domain/teacher-today.js";

/** Report states in which the teacher has sent the lesson and its topic percents are not applied yet. */
const SENT_NOT_APPLIED_REPORT_STATUSES = ["pending_sync", "pending_review", "approving", "conflict"];
/** Report states after which the teacher has nothing left to send for the lesson. */
export const SENT_REPORT_STATUSES = [...SENT_NOT_APPLIED_REPORT_STATUSES, "confirmed", "correcting"] as const;
/**
 * Only recent lessons chain. A report CRM never finishes (the lesson was cancelled or deleted in CRM
 * after it was sent) must not hold a topic's percent for ever.
 */
const PENDING_CHAIN_LOOKBACK_DAYS = 14;
/** Outbox states of an approval whose results (topic percents, rewards) are not applied yet. */
// «resolved»: closed by «Принять расписание» before 07.11 (now refused for approvals); kept so
// such old approvals are not waited for. Topic decisions never change an approval's status.
const APPROVAL_DONE_EVENT_STATUSES = ["succeeded", "cancelled", "resolved"];

export type PendingTopicPercent = {
  percent: number;
  crmClassId: string;
  title: string | null;
  date: string | null;
  startTime: string | null;
  /** 07.11: the lesson is approved in CRM, its percent waits for an earlier lesson's approval. */
  approvedWaitingForEarlier?: boolean;
};

/** Kept literal: importing the conflict service here would close an import cycle. */
const TOPIC_CONFLICT_KIND = "topic_percent_mismatch";

type LessonMeta = { title?: unknown; date?: unknown; startTime?: unknown };

function lessonTopicSourceKey(crmClassId: string, topicId: string) {
  return `offline-lesson:${crmClassId}:topic:${topicId}`;
}

function readTopicUpdates(payload: unknown): Array<{ topicId: string; toPercent: number }> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const results = (payload as Record<string, unknown>).learningResultsV2;
  if (!results || typeof results !== "object" || Array.isArray(results)) return [];
  const updates = (results as Record<string, unknown>).topicUpdates;
  if (!Array.isArray(updates)) return [];
  return updates.flatMap((update) => {
    if (!update || typeof update !== "object") return [];
    const { topicId, toPercent } = update as Record<string, unknown>;
    return typeof topicId === "string" && typeof toPercent === "number" && Number.isInteger(toPercent)
      ? [{ topicId, toPercent }]
      : [];
  });
}

/**
 * 31.10 (Vladislav): the percent a topic will have once the teacher's earlier sent lessons are
 * approved. A lesson that follows a sent but unapproved one continues from that report, so the
 * two reports chain at approval — an approval out of order waits and retries until the earlier
 * one is applied — instead of colliding on a stale percent. Only lessons that start before
 * `lesson` count; per topic the latest of them wins.
 */
export async function pendingTopicPercentsBefore(
  lesson: { crmClassId: string; date?: unknown; startTime?: unknown },
  topicIds: readonly string[],
): Promise<Map<string, PendingTopicPercent>> {
  const result = new Map<string, PendingTopicPercent>();
  const wanted = new Set(topicIds);
  const startsAt = aqtobeDateTime(lesson.date, lesson.startTime);
  if (!wanted.size || !startsAt) return result;

  // An approval CRM already confirmed waits in the outbox (e.g. it came before the earlier
  // lesson's): its report is «confirmed» but its percents are not written yet.
  const approvalsInFlight = await prisma.crmOutboxEvent.findMany({
    where: { eventType: "admin_approve", status: { notIn: APPROVAL_DONE_EVENT_STATUSES } },
    select: { aggregateId: true },
  });
  const reports = await prisma.offlineLessonReport.findMany({
    where: {
      crmClassId: { not: lesson.crmClassId },
      currentVersion: { gt: 0 },
      OR: [
        { status: { in: SENT_NOT_APPLIED_REPORT_STATUSES } },
        { status: "confirmed", crmClassId: { in: approvalsInFlight.map((event) => event.aggregateId) } },
      ],
    },
    select: {
      id: true,
      crmClassId: true,
      currentVersion: true,
      projection: { select: { lessonPayload: true, status: true } },
    },
  });
  const versions = reports.length
    ? await prisma.offlineLessonReportVersion.findMany({
        where: {
          state: "submitted",
          OR: reports.map((report) => ({ reportId: report.id, version: report.currentVersion })),
        },
        select: { reportId: true, payload: true },
      })
    : [];
  const payloadByReport = new Map(versions.map((version) => [version.reportId, version.payload]));

  type Candidate = {
    crmClassId: string;
    meta: LessonMeta;
    start: Date;
    updates: Array<{ topicId: string; toPercent: number }>;
    approvedWaiting?: boolean;
  };
  const candidates: Candidate[] = reports.flatMap((report) => {
    if (report.projection?.status === "cancelled") return [];
    const meta = (report.projection?.lessonPayload ?? {}) as LessonMeta;
    const start = aqtobeDateTime(meta.date, meta.startTime);
    if (!start || start >= startsAt) return [];
    if (startsAt.getTime() - start.getTime() > PENDING_CHAIN_LOOKBACK_DAYS * 86_400_000) return [];
    const updates = readTopicUpdates(payloadByReport.get(report.id))
      .filter((update) => wanted.has(update.topicId));
    return updates.length ? [{ crmClassId: report.crmClassId, meta, start, updates }] : [];
  });
  // 07.11 (P2): a later lesson approved before the earlier one waits in a topic conflict; for the
  // next lesson its percent is as pending as a sent report's, so «было» continues from it.
  const waitingConflicts = await prisma.crmSyncConflict.findMany({
    where: { kind: TOPIC_CONFLICT_KIND, status: "open", crmClassId: { not: lesson.crmClassId } },
    select: { crmClassId: true, localPayload: true },
  });
  if (waitingConflicts.length) {
    const projections = await prisma.offlineLessonProjection.findMany({
      where: { crmClassId: { in: waitingConflicts.map((conflict) => conflict.crmClassId) } },
      select: { crmClassId: true, lessonPayload: true, status: true },
    });
    const metaByClass = new Map(projections.map((projection) => [projection.crmClassId, projection]));
    for (const conflict of waitingConflicts) {
      const projection = metaByClass.get(conflict.crmClassId);
      if (!projection || projection.status === "cancelled") continue;
      const meta = (projection.lessonPayload ?? {}) as LessonMeta;
      const start = aqtobeDateTime(meta.date, meta.startTime);
      if (!start || start >= startsAt) continue;
      if (startsAt.getTime() - start.getTime() > PENDING_CHAIN_LOOKBACK_DAYS * 86_400_000) continue;
      const topics = ((conflict.localPayload ?? {}) as { topics?: unknown }).topics;
      const updates = (Array.isArray(topics) ? topics : []).flatMap((entry) => {
        const { topicId, toPercent, reason } = (entry ?? {}) as Record<string, unknown>;
        return reason === "waiting" && typeof topicId === "string" && wanted.has(topicId) && typeof toPercent === "number"
          ? [{ topicId, toPercent }]
          : [];
      });
      if (updates.length) candidates.push({ crmClassId: conflict.crmClassId, meta, start, updates, approvedWaiting: true });
    }
  }

  if (!candidates.length) return result;

  const applied = new Set((await prisma.learningTopicProgress.findMany({
    where: {
      sourceKey: {
        in: candidates.flatMap((candidate) => candidate.updates.map((update) => (
          lessonTopicSourceKey(candidate.crmClassId, update.topicId)
        ))),
      },
    },
    select: { sourceKey: true },
  })).map((row) => row.sourceKey));

  candidates.sort((left, right) => left.start.getTime() - right.start.getTime());
  for (const candidate of candidates) {
    for (const update of candidate.updates) {
      if (applied.has(lessonTopicSourceKey(candidate.crmClassId, update.topicId))) continue;
      result.set(update.topicId, {
        percent: update.toPercent,
        crmClassId: candidate.crmClassId,
        title: typeof candidate.meta.title === "string" ? candidate.meta.title : null,
        date: String(candidate.meta.date ?? "").slice(0, 10) || null,
        startTime: String(candidate.meta.startTime ?? "").slice(0, 5) || null,
        approvedWaitingForEarlier: Boolean(candidate.approvedWaiting),
      });
    }
  }
  return result;
}
