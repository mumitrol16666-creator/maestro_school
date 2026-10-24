import { prisma } from "../../infrastructure/database/prisma.js";

/**
 * Plan 2.7: what a confirmed lesson gave the student — XP for coming, the teacher's bonus of that
 * day, the sector before and after, the teacher's check of the previous homework. Everything is
 * read from the rows the lesson already wrote; nothing new is stored.
 */
export type LessonTopicChange = {
  topicId: string;
  fromPercent: number | null;
  toPercent: number;
  occurredAt: Date;
};

export type StudentLessonRewards = {
  xp: number;
  bonusXp: number;
};

export type StudentLessonSectorProgress = {
  planId: string;
  sequence: number | null;
  direction: string | null;
  fromPercent: number;
  toPercent: number;
  completed: number;
  total: number;
};

export type StudentLessonHomeworkCheck = {
  topicTitle: string;
  completionPercent: number;
  comment: string | null;
  reviewedAt: Date;
};

const aqtobeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Aqtobe: a teacher's bonus counts for the lesson of the same day. */
export function aqtobeDayKey(value: Date | string) {
  return aqtobeDay.format(new Date(value));
}

export function percentOfMastered(completed: number, total: number) {
  return total ? Math.round((completed / total) * 100) : 0;
}

/**
 * The sector around one lesson: how many topics were mastered before it and after it. Topics the
 * lesson brought to 100 count as mastered after; everything mastered earlier counts as before.
 */
export function sectorProgressAroundLesson(input: {
  plan: { id: string; sequence: number | null; direction: string | null; topics: Array<{ topicId: string; masteredAt: Date | null }> };
  changes: LessonTopicChange[];
}): StudentLessonSectorProgress {
  const total = input.plan.topics.length;
  const lessonAt = input.changes.reduce((latest, change) => (change.occurredAt > latest ? change.occurredAt : latest), new Date(0));
  const masteredByLesson = new Set(input.changes.filter((change) => change.toPercent === 100 && change.fromPercent !== 100).map((change) => change.topicId));
  const completedAfter = input.plan.topics.filter((topic) => (
    masteredByLesson.has(topic.topicId) || (topic.masteredAt !== null && topic.masteredAt <= lessonAt)
  )).length;
  const completedBefore = completedAfter - input.plan.topics.filter((topic) => masteredByLesson.has(topic.topicId)).length;
  return {
    planId: input.plan.id,
    sequence: input.plan.sequence,
    direction: input.plan.direction,
    fromPercent: percentOfMastered(Math.max(0, completedBefore), total),
    toPercent: percentOfMastered(completedAfter, total),
    completed: completedAfter,
    total,
  };
}

/**
 * XP of the confirmed lessons: the 20 for coming (keyed by lesson) and a bonus given the same day,
 * shown on the first confirmed lesson of that day.
 */
export async function readLessonRewards(input: {
  appUserId: string;
  crmStudentId: string;
  lessons: Array<{ crmClassId: string; date: string; startTime?: string | null; status?: string | null; crmTeacherId?: string | null }>;
}) {
  input = {
    ...input,
    lessons: [...input.lessons]
      .filter((lesson) => lesson.status === "completed")
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime ?? "").localeCompare(String(b.startTime ?? ""))),
  };
  if (!input.lessons.length) return new Map<string, StudentLessonRewards>();
  const events = await prisma.leagueXpEvent.findMany({
    where: {
      studentId: input.appUserId,
      reversedAt: null,
      OR: [
        { sourceKey: { in: input.lessons.map((lesson) => `offline-lesson:${lesson.crmClassId}:${input.crmStudentId}`) } },
        { sourceType: "teacher_bonus" },
      ],
    },
    select: { sourceType: true, sourceKey: true, amount: true, recordedAt: true, createdAt: true, awardedById: true },
  });
  // A bonus belongs to the lesson of the teacher who gave it, on the same Aqtobe day.
  const teacherIds = [...new Set(input.lessons.map((lesson) => lesson.crmTeacherId).filter((id): id is string => Boolean(id)))];
  const teacherUsers = teacherIds.length
    ? await prisma.user.findMany({ where: { crmTeacherId: { in: teacherIds } }, select: { id: true, crmTeacherId: true } })
    : [];
  const userIdByCrmTeacher = new Map(teacherUsers.map((user) => [user.crmTeacherId!, user.id]));
  const bonusByDayAndTeacher = new Map<string, number>();
  for (const event of events) {
    if (event.sourceType !== "teacher_bonus" || !event.awardedById) continue;
    const key = `${aqtobeDayKey(event.recordedAt ?? event.createdAt)}:${event.awardedById}`;
    bonusByDayAndTeacher.set(key, (bonusByDayAndTeacher.get(key) ?? 0) + event.amount);
  }
  const result = new Map<string, StudentLessonRewards>();
  const bonusTaken = new Set<string>();
  for (const lesson of input.lessons) {
    const key = `offline-lesson:${lesson.crmClassId}:${input.crmStudentId}`;
    const xp = events.filter((event) => event.sourceKey === key).reduce((sum, event) => sum + event.amount, 0);
    const teacherUserId = lesson.crmTeacherId ? userIdByCrmTeacher.get(lesson.crmTeacherId) : null;
    const bonusKey = teacherUserId ? `${aqtobeDayKey(lesson.date)}:${teacherUserId}` : null;
    const bonusXp = bonusKey && !bonusTaken.has(bonusKey) ? bonusByDayAndTeacher.get(bonusKey) ?? 0 : 0;
    if (bonusXp && bonusKey) bonusTaken.add(bonusKey);
    if (xp || bonusXp) result.set(lesson.crmClassId, { xp, bonusXp });
  }
  return result;
}

/** The published sector of the topics a lesson moved, with every topic's mastery date. */
export async function readSectorProgress(changesByClassId: Map<string, LessonTopicChange[]>) {
  const topicIds = [...new Set([...changesByClassId.values()].flat().map((change) => change.topicId))];
  const result = new Map<string, StudentLessonSectorProgress>();
  if (!topicIds.length) return result;
  const links = await prisma.learningPlanTopic.findMany({
    where: { topicId: { in: topicIds }, state: "active" },
    select: {
      topicId: true,
      planVersion: {
        select: {
          version: true,
          plan: {
            select: {
              id: true,
              sequence: true,
              publishedVersionNumber: true,
              direction: { select: { title: true } },
              versions: {
                select: {
                  version: true,
                  topics: { where: { state: "active" }, select: { topicId: true, topic: { select: { masteredAt: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const planByTopic = new Map<string, { id: string; sequence: number | null; direction: string | null; topics: Array<{ topicId: string; masteredAt: Date | null }> }>();
  for (const link of links) {
    const plan = link.planVersion.plan;
    if (plan.publishedVersionNumber !== link.planVersion.version) continue;
    const published = plan.versions.find((version) => version.version === plan.publishedVersionNumber);
    if (!published) continue;
    planByTopic.set(link.topicId, {
      id: plan.id,
      sequence: plan.sequence,
      direction: plan.direction?.title ?? null,
      topics: published.topics.map((item) => ({ topicId: item.topicId, masteredAt: item.topic.masteredAt })),
    });
  }
  for (const [crmClassId, changes] of changesByClassId) {
    const plan = changes.map((change) => planByTopic.get(change.topicId)).find(Boolean);
    if (!plan) continue;
    result.set(crmClassId, sectorProgressAroundLesson({ plan, changes: changes.filter((change) => planByTopic.get(change.topicId)?.id === plan.id) }));
  }
  return result;
}

/** The teacher's check of the previous homework made on this lesson (percent and comment). */
export async function readHomeworkChecks(input: { crmStudentId: string; crmClassIds: string[] }) {
  const result = new Map<string, StudentLessonHomeworkCheck[]>();
  if (!input.crmClassIds.length) return result;
  const reviews = await prisma.learningHomeworkReview.findMany({
    where: {
      completionPercent: { not: null },
      recipient: { crmStudentId: input.crmStudentId },
      OR: input.crmClassIds.map((crmClassId) => ({ idempotencyKey: { startsWith: `offline-lesson:${crmClassId}:homework:` } })),
    },
    select: {
      idempotencyKey: true,
      completionPercent: true,
      comment: true,
      reviewedAt: true,
      recipient: { select: { assignment: { select: { topic: { select: { title: true } } } } } },
    },
    orderBy: { reviewedAt: "asc" },
  });
  for (const review of reviews) {
    const crmClassId = input.crmClassIds.find((id) => review.idempotencyKey?.startsWith(`offline-lesson:${id}:homework:`));
    if (!crmClassId || review.completionPercent === null) continue;
    const list = result.get(crmClassId) ?? [];
    list.push({
      topicTitle: review.recipient.assignment.topic.title,
      completionPercent: review.completionPercent,
      comment: review.comment?.trim() || null,
      reviewedAt: review.reviewedAt,
    });
    result.set(crmClassId, list);
  }
  return result;
}

/** One line for the «Готов итог урока» notification: Points and the topics that moved. */
export function lessonResultBrief(input: {
  points: number;
  xp: number;
  topics: Array<{ title: string; fromPercent: number | null; toPercent: number }>;
}) {
  const parts: string[] = [];
  if (input.points > 0) parts.push(`+${input.points} баллов`);
  if (input.xp > 0) parts.push(`+${input.xp} XP`);
  for (const topic of input.topics.slice(0, 2)) {
    parts.push(`«${topic.title}» ${topic.fromPercent ?? 0} → ${topic.toPercent} %`);
  }
  if (input.topics.length > 2) parts.push(`ещё ${input.topics.length - 2}`);
  return parts.join(" · ");
}
