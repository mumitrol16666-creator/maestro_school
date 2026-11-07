import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import {
  curatorWorkspaceV2Enabled,
  resolveAdminJournalEntryBySource,
  upsertAdminJournalEntry,
} from "./admin-journal.service.js";
import {
  type SkippedLessonTopicUpdate,
  updateLearningTopicProgressBatchFromLessonV2,
} from "./learning-plan-v2.service.js";

/**
 * 04.11 (Vladislav, rule of 26.09): when a CRM-approved lesson carries a topic percent that no
 * longer matches the topic («было 33 %», but the topic already moved), the lesson itself is
 * finalized — attendance, Points, Coins, homework — and only that topic goes to the admin as a
 * conflict on the lesson page. The admin writes the lesson's percent or keeps the current one.
 * A lesson approved before an earlier one waits here and is written as soon as the topic reaches
 * the percent it continues from.
 */
export const LESSON_TOPIC_CONFLICT_KIND = "topic_percent_mismatch";

type StoredTopicEntry = SkippedLessonTopicUpdate;

type StoredTopicConflict = {
  reportVersion: number | null;
  approvedBy: string;
  /** The approved version's attendance: who gets the 100 % mastery reward of a group topic. */
  recipientCrmStudentIds: string[] | null;
  /** When the lesson happened: Points and the topic history carry the lesson's date. */
  occurredAt: string | null;
  topics: StoredTopicEntry[];
};

function readStored(payload: Prisma.JsonValue): StoredTopicConflict {
  const value = (payload ?? {}) as Partial<StoredTopicConflict>;
  return {
    reportVersion: typeof value.reportVersion === "number" ? value.reportVersion : null,
    approvedBy: typeof value.approvedBy === "string" ? value.approvedBy : "",
    recipientCrmStudentIds: Array.isArray(value.recipientCrmStudentIds)
      ? value.recipientCrmStudentIds.filter((id): id is string => typeof id === "string")
      : null,
    occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : null,
    topics: Array.isArray(value.topics) ? value.topics as StoredTopicEntry[] : [],
  };
}

/** `current` overrides the percent stored at conflict time: texts show what the topic has now. */
function describe(topics: readonly StoredTopicEntry[], current: ReadonlyMap<string, number> = new Map()) {
  return topics.map((topic) => {
    const now = current.get(topic.topicId) ?? topic.currentPercent;
    if (topic.reason === "mastered") {
      return `«${topic.title}»: тема уже освоена (100%), урок ставил ${topic.toPercent}%. Снять освоение может только куратор, поэтому остаётся «Оставить как есть».`;
    }
    if (topic.reason === "recorded") {
      return `«${topic.title}»: по этому уроку процент уже записан прежней версией отчёта, новая ставила ${topic.toPercent}%. Остаётся «Оставить как есть».`;
    }
    if (topic.reason === "waiting") {
      return `«${topic.title}»: урок ставил ${topic.expectedPercent ?? 0} → ${topic.toPercent}%, тема сейчас ${now}%. Когда подтвердят урок ${topic.waitingFor ?? "до этого"}, процент запишется сам. Если ждать не нужно, запишите его сейчас.`;
    }
    return `«${topic.title}»: урок ставил ${topic.expectedPercent ?? 0} → ${topic.toPercent}%, а в теме уже ${now}%.`;
  }).join(" ");
}

/**
 * The admin can write «stale» and «waiting» entries (a waiting one without waiting for the earlier
 * lesson, e.g. that lesson will never be approved); «mastered» and «recorded» cannot be written.
 */
function writable(entry: StoredTopicEntry) {
  return entry.reason === "stale" || entry.reason === "waiting";
}

function lessonSourceKey(crmClassId: string, topicId: string) {
  return `offline-lesson:${crmClassId}:topic:${topicId}`;
}

async function alreadyWritten(crmClassId: string, topicId: string) {
  return Boolean(await prisma.learningTopicProgress.findUnique({
    where: { sourceKey: lessonSourceKey(crmClassId, topicId) },
    select: { id: true },
  }));
}

async function currentPercents(topicIds: readonly string[]) {
  const topics = topicIds.length
    ? await prisma.learningTopic.findMany({ where: { id: { in: [...new Set(topicIds)] } }, select: { id: true, progressPercent: true } })
    : [];
  return new Map(topics.map((topic) => [topic.id, topic.progressPercent ?? 0]));
}

/**
 * The admin journal and the lesson page read the stored message; this refreshes it to the topics'
 * current percents and says which decision is possible. Used by the sync journal listing.
 */
export async function presentLessonTopicConflict<T extends { kind: string; localPayload: Prisma.JsonValue; errorMessage: string }>(conflict: T) {
  if (conflict.kind !== LESSON_TOPIC_CONFLICT_KIND) return { ...conflict, canWriteLesson: null };
  const stored = readStored(conflict.localPayload);
  const current = await currentPercents(stored.topics.map((topic) => topic.topicId));
  return {
    ...conflict,
    errorMessage: describe(stored.topics, current),
    canWriteLesson: stored.topics.some(writable),
    waitingOnly: stored.topics.length > 0 && stored.topics.every((topic) => topic.reason === "waiting"),
  };
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Keeps one open topic conflict per lesson; a later approval attempt replaces its topic list. */
function journalKey(crmClassId: string) {
  return `lesson-topic-conflict:${crmClassId}`;
}

/** A newer approved version, a CRM return or a reopened report makes the old topic list moot. */
export async function closeLessonTopicConflicts(
  crmClassId: string,
  resolution: string,
  note: string,
  database: Pick<typeof prisma, "crmSyncConflict"> = prisma,
) {
  const closed = await database.crmSyncConflict.updateMany({
    where: { crmClassId, kind: LESSON_TOPIC_CONFLICT_KIND, status: { not: "resolved" } },
    data: { status: "resolved", resolution, resolutionNote: note, resolvedAt: new Date() },
  });
  if (closed.count && database === prisma && curatorWorkspaceV2Enabled()) {
    await resolveAdminJournalEntryBySource({
      sourceKey: journalKey(crmClassId),
      resolution: note,
      actionKey: `${journalKey(crmClassId)}:${resolution}`,
      payload: { crmClassId },
    });
  }
  return closed.count;
}

export async function recordLessonTopicConflicts(params: {
  crmClassId: string;
  reportVersion: number | null;
  approvedBy: string;
  recipientCrmStudentIds?: readonly string[] | null;
  occurredAt?: Date | null;
  topics: readonly SkippedLessonTopicUpdate[];
}) {
  if (!params.topics.length) {
    await closeLessonTopicConflicts(params.crmClassId, "superseded", "Новая подтверждённая версия урока записала темы без расхождений");
    return null;
  }
  const payload: StoredTopicConflict = {
    reportVersion: params.reportVersion,
    approvedBy: params.approvedBy,
    recipientCrmStudentIds: params.recipientCrmStudentIds ? [...params.recipientCrmStudentIds] : null,
    occurredAt: params.occurredAt ? params.occurredAt.toISOString() : null,
    topics: [...params.topics],
  };
  const errorMessage = describe(params.topics);
  const existing = await prisma.crmSyncConflict.findFirst({
    where: { crmClassId: params.crmClassId, kind: LESSON_TOPIC_CONFLICT_KIND, status: { not: "resolved" } },
  });
  const conflict = existing
    ? await prisma.crmSyncConflict.update({
        where: { id: existing.id },
        data: { status: "open", localPayload: asJson(payload), errorMessage },
      })
    : await prisma.crmSyncConflict.create({
        data: {
          crmClassId: params.crmClassId,
          kind: LESSON_TOPIC_CONFLICT_KIND,
          localPayload: asJson(payload),
          errorMessage,
        },
      });
  if (curatorWorkspaceV2Enabled()) {
    await upsertAdminJournalEntry({
      sourceKey: journalKey(params.crmClassId),
      type: "crm_sync",
      severity: params.topics.every((topic) => topic.reason === "waiting") ? "normal" : "high",
      source: "crm",
      linkedEntityType: "crm_sync_conflict",
      linkedEntityId: conflict.id,
      title: "Урок принят, проценты тем не записаны",
      summary: errorMessage.slice(0, 1000),
      payload: { crmClassId: params.crmClassId, kind: LESSON_TOPIC_CONFLICT_KIND },
    });
  }
  return conflict;
}

async function topicPercent(topicId: string) {
  const topic = await prisma.learningTopic.findUnique({
    where: { id: topicId },
    select: { progressPercent: true, archivedAt: true },
  });
  return topic && !topic.archivedAt ? topic.progressPercent ?? 0 : null;
}

async function writeEntry(
  conflict: { crmClassId: string },
  stored: StoredTopicConflict,
  actorId: string,
  entry: StoredTopicEntry,
  fromPercent: number,
) {
  await updateLearningTopicProgressBatchFromLessonV2(actorId, conflict.crmClassId, [{
    topicId: entry.topicId,
    expectedPercent: fromPercent,
    toPercent: entry.toPercent,
  }], {
    occurredAt: stored.occurredAt ? new Date(stored.occurredAt) : undefined,
    rewardRecipientCrmStudentIds: stored.recipientCrmStudentIds ?? undefined,
  });
}

async function saveRemaining(
  conflict: { id: string; localPayload: Prisma.JsonValue },
  stored: StoredTopicConflict,
  remaining: StoredTopicEntry[],
  resolution: { by: string | null; how: string; note: string | null },
) {
  if (remaining.length) {
    await prisma.crmSyncConflict.update({
      where: { id: conflict.id },
      data: {
        localPayload: asJson({ ...stored, topics: remaining }),
        errorMessage: describe(remaining),
      },
    });
    return false;
  }
  await prisma.crmSyncConflict.update({
    where: { id: conflict.id },
    data: {
      status: "resolved",
      resolution: resolution.how,
      resolutionNote: resolution.note,
      resolvedById: resolution.by,
      resolvedAt: new Date(),
    },
  });
  if (curatorWorkspaceV2Enabled()) {
    const crmClassId = (await prisma.crmSyncConflict.findUnique({ where: { id: conflict.id }, select: { crmClassId: true } }))?.crmClassId;
    if (crmClassId) {
      await resolveAdminJournalEntryBySource({
        sourceKey: journalKey(crmClassId),
        resolution: resolution.note ?? "Решено",
        actionKey: `${journalKey(crmClassId)}:${resolution.how}`,
        payload: { crmClassId },
      });
    }
  }
  return true;
}

/**
 * A lesson approved before the earlier one: once the topic reaches the percent this lesson
 * continues from, its percent is written as the teacher sent it. Called after each finalization.
 */
export async function applyWaitingLessonTopicConflicts(topicIds: readonly string[]) {
  const wanted = new Set(topicIds);
  if (!wanted.size) return 0;
  let applied = 0;
  // One write can make another waiting lesson ready (39 → 45 opens 45 → 50): repeat while
  // something is written. Each pass writes at least one entry, so the loop is bounded.
  for (;;) {
    const written = await applyWaitingPass(wanted);
    applied += written;
    if (!written) return applied;
  }
}

async function applyWaitingPass(wanted: ReadonlySet<string>) {
  const conflicts = await prisma.crmSyncConflict.findMany({
    where: { kind: LESSON_TOPIC_CONFLICT_KIND, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  let applied = 0;
  for (const conflict of conflicts) {
    const stored = readStored(conflict.localPayload);
    if (!stored.approvedBy || !stored.topics.some((topic) => wanted.has(topic.topicId))) continue;
    const remaining: StoredTopicEntry[] = [];
    for (const entry of stored.topics) {
      // A crash between the write and saving the list leaves a written entry behind: drop it.
      if (await alreadyWritten(conflict.crmClassId, entry.topicId)) continue;
      // Only a lesson that waits for an earlier one is written by itself (rule of 26.09: a real
      // mismatch is the admin's decision, it never closes because the topic happened to come by).
      const current = wanted.has(entry.topicId) && entry.reason === "waiting"
        ? await topicPercent(entry.topicId)
        : null;
      if (current === null || current !== entry.expectedPercent || current === 100) {
        remaining.push(entry);
        continue;
      }
      try {
        await writeEntry(conflict, stored, stored.approvedBy, entry, current);
        applied += 1;
      } catch (error) {
        // 07.11 (review): the automatic write runs as the lesson's author; a closed substitution or
        // CRM being down refuses it. It must not hang silently — the admin gets it to decide.
        console.warn("lesson topic conflict: automatic write failed", conflict.crmClassId, entry.topicId, error);
        remaining.push({ ...entry, reason: "stale", waitingFor: null, waitingForCrmClassId: null });
      }
    }
    if (remaining.length !== stored.topics.length || remaining.some((entry, index) => entry.reason !== stored.topics[index]?.reason)) {
      await saveRemaining(conflict, stored, remaining, { by: null, how: "auto_applied", note: "Записано после подтверждения предыдущего урока" });
    }
  }
  return applied;
}

/**
 * 07.11 (review): a later lesson waits for a named earlier one. When that lesson is approved, its
 * waiting dependents are written if the topic now stands at their «было»; otherwise — and when it
 * is returned, reopened or cancelled — they become a plain mismatch for the admin to decide.
 */
export async function releaseLessonsWaitingFor(earlierCrmClassId: string, why: "approved" | "returned" | "cancelled") {
  const conflicts = await prisma.crmSyncConflict.findMany({
    where: { kind: LESSON_TOPIC_CONFLICT_KIND, status: "open" },
    orderBy: { createdAt: "asc" },
  });
  const touchedTopics: string[] = [];
  for (const conflict of conflicts) {
    const stored = readStored(conflict.localPayload);
    if (!stored.topics.some((entry) => entry.reason === "waiting" && entry.waitingForCrmClassId === earlierCrmClassId)) continue;
    const topics = stored.topics.map((entry) => {
      if (entry.reason !== "waiting" || entry.waitingForCrmClassId !== earlierCrmClassId) return entry;
      touchedTopics.push(entry.topicId);
      // After an approval the chain below writes the ones that now match; anything left is the admin's.
      return why === "approved" ? entry : { ...entry, reason: "stale" as const, waitingFor: null, waitingForCrmClassId: null };
    });
    await prisma.crmSyncConflict.update({
      where: { id: conflict.id },
      data: { localPayload: asJson({ ...stored, topics }), errorMessage: describe(topics) },
    });
  }
  if (why === "approved" && touchedTopics.length) {
    await applyWaitingLessonTopicConflicts(touchedTopics);
    // What the approval did not bring to «было» will not come by itself any more.
    const left = await prisma.crmSyncConflict.findMany({ where: { kind: LESSON_TOPIC_CONFLICT_KIND, status: "open" } });
    for (const conflict of left) {
      const stored = readStored(conflict.localPayload);
      if (!stored.topics.some((entry) => entry.reason === "waiting" && entry.waitingForCrmClassId === earlierCrmClassId)) continue;
      const topics = stored.topics.map((entry) => (
        entry.reason === "waiting" && entry.waitingForCrmClassId === earlierCrmClassId
          ? { ...entry, reason: "stale" as const, waitingFor: null, waitingForCrmClassId: null }
          : entry
      ));
      await prisma.crmSyncConflict.update({
        where: { id: conflict.id },
        data: { localPayload: asJson({ ...stored, topics }), errorMessage: describe(topics) },
      });
    }
  }
  return touchedTopics.length;
}

/**
 * Admin decision on the lesson page. `write_lesson` puts the lesson's percent on the topic
 * starting from what the topic has now; `keep_current` closes the conflict without writing.
 */
export async function resolveLessonTopicConflict(
  conflictId: string,
  actorId: string,
  decision: "write_lesson" | "keep_current",
  reason: string,
) {
  const conflict = await prisma.crmSyncConflict.findUnique({ where: { id: conflictId } });
  if (!conflict || conflict.kind !== LESSON_TOPIC_CONFLICT_KIND) {
    throw new BadRequestError("Конфликт не найден", "CRM_CONFLICT_NOT_FOUND");
  }
  if (conflict.status === "resolved") return conflict;
  const stored = readStored(conflict.localPayload);
  if (decision === "keep_current") {
    // An explicit admin decision: every topic of this lesson keeps its current percent.
    await saveRemaining(conflict, stored, [], { by: actorId, how: "keep_current", note: reason });
    // Lessons that waited for this one's percent will not get it: they go to the admin too.
    await releaseLessonsWaitingFor(conflict.crmClassId, "cancelled");
    return prisma.crmSyncConflict.findUnique({ where: { id: conflictId } });
  }
  if (!stored.topics.some(writable)) {
    throw new ConflictError(
      "Здесь нечего записывать: темы освоены или уже записаны прежней версией отчёта. Выберите «Оставить как есть».",
      "LESSON_TOPIC_CONFLICT_NOT_WRITABLE",
    );
  }
  const remaining: StoredTopicEntry[] = [];
  const failures: string[] = [];
  const written: string[] = [];
  for (const entry of stored.topics) {
    if (!writable(entry)) {
      remaining.push(entry);
      continue;
    }
    const current = await topicPercent(entry.topicId);
    if (current === null) continue; // the topic was archived: nothing left to write
    if (current === entry.toPercent) continue;
    if (current === 100) {
      remaining.push(entry);
      failures.push(`«${entry.title}» освоена: снять отметку может только куратор.`);
      continue;
    }
    try {
      await writeEntry(conflict, stored, actorId, entry, current);
      written.push(entry.topicId);
    } catch (error) {
      remaining.push(entry);
      failures.push(`«${entry.title}»: ${error instanceof Error ? error.message : "не записано"}`);
    }
  }
  await saveRemaining(conflict, stored, remaining, { by: actorId, how: "write_lesson", note: reason });
  // A later lesson that continues from the percent just written can go in now; one that waited for
  // this lesson and still does not match goes to the admin.
  if (written.length) await applyWaitingLessonTopicConflicts(written);
  await releaseLessonsWaitingFor(conflict.crmClassId, "approved");
  if (failures.length) {
    throw new ConflictError(`Записаны не все темы. ${failures.join(" ")}`, "LESSON_TOPIC_CONFLICT_PARTIAL");
  }
  return prisma.crmSyncConflict.findUnique({ where: { id: conflictId } });
}

export type OpenTopicConflict = {
  crmClassId: string;
  lessonDate: string | null;
  lessonTitle: string | null;
  toPercent: number;
  currentPercent: number;
  reason: StoredTopicEntry["reason"];
};

/**
 * Open topic conflicts that mention these topics, for the teacher's lesson screen. Lessons dated
 * after `beforeDate` (the lesson being filled) do not count; the percent is the topic's percent now.
 */
export async function openTopicConflictsFor(topicIds: readonly string[], beforeDate?: string | null) {
  const wanted = new Set(topicIds);
  const result = new Map<string, OpenTopicConflict>();
  if (!wanted.size) return result;
  const conflicts = await prisma.crmSyncConflict.findMany({
    where: { kind: LESSON_TOPIC_CONFLICT_KIND, status: "open" },
    orderBy: { createdAt: "asc" },
    select: { crmClassId: true, localPayload: true },
  });
  if (!conflicts.length) return result;
  const projections = await prisma.offlineLessonProjection.findMany({
    where: { crmClassId: { in: conflicts.map((conflict) => conflict.crmClassId) } },
    select: { crmClassId: true, lessonPayload: true },
  });
  const meta = new Map(projections.map((projection) => {
    const payload = (projection.lessonPayload ?? {}) as { date?: unknown; startTime?: unknown; title?: unknown };
    const date = String(payload.date ?? "").slice(0, 10) || null;
    const time = String(payload.startTime ?? "").slice(0, 5) || "00:00";
    return [projection.crmClassId, { date, order: date ? `${date}T${time}` : null, title: typeof payload.title === "string" ? payload.title : null }] as const;
  }));
  const current = await currentPercents([...wanted]);
  for (const conflict of conflicts) {
    const lesson = meta.get(conflict.crmClassId);
    // `beforeDate` is the lesson being filled as «YYYY-MM-DD» or «YYYY-MM-DDTHH:MM»: a later lesson,
    // also later the same day, is not «прошлый урок».
    if (beforeDate && lesson?.order && lesson.order >= (beforeDate.length > 10 ? beforeDate : `${beforeDate}T23:59`)) continue;
    for (const entry of readStored(conflict.localPayload).topics) {
      if (!wanted.has(entry.topicId)) continue;
      // The topic already stands at the lesson's percent: nothing is missing for the teacher.
      if ((current.get(entry.topicId) ?? entry.currentPercent) === entry.toPercent) continue;
      result.set(entry.topicId, {
        crmClassId: conflict.crmClassId,
        lessonDate: lesson?.date ?? null,
        lessonTitle: lesson?.title ?? null,
        toPercent: entry.toPercent,
        currentPercent: current.get(entry.topicId) ?? entry.currentPercent,
        reason: entry.reason,
      });
    }
  }
  return result;
}
