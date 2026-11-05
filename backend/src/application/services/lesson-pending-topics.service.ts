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
// «resolved»: the admin closed the approval conflict on the lesson page; nothing is in flight.
const APPROVAL_DONE_EVENT_STATUSES = ["succeeded", "cancelled", "resolved"];

export type PendingTopicPercent = {
  percent: number;
  crmClassId: string;
  title: string | null;
  date: string | null;
  startTime: string | null;
};

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
  if (!reports.length) return result;

  const versions = await prisma.offlineLessonReportVersion.findMany({
    where: {
      state: "submitted",
      OR: reports.map((report) => ({ reportId: report.id, version: report.currentVersion })),
    },
    select: { reportId: true, payload: true },
  });
  const payloadByReport = new Map(versions.map((version) => [version.reportId, version.payload]));

  const candidates = reports.flatMap((report) => {
    if (report.projection?.status === "cancelled") return [];
    const meta = (report.projection?.lessonPayload ?? {}) as LessonMeta;
    const start = aqtobeDateTime(meta.date, meta.startTime);
    if (!start || start >= startsAt) return [];
    if (startsAt.getTime() - start.getTime() > PENDING_CHAIN_LOOKBACK_DAYS * 86_400_000) return [];
    const updates = readTopicUpdates(payloadByReport.get(report.id))
      .filter((update) => wanted.has(update.topicId));
    return updates.length ? [{ crmClassId: report.crmClassId, meta, start, updates }] : [];
  });
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
      });
    }
  }
  return result;
}
