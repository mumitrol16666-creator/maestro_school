/**
 * Plan 5.4: the parent's week in one card and one sentence to say to the child. Built from what
 * the parent is already allowed to see: confirmed visits and the topics those lessons moved.
 * No homework queues and no teacher's notes.
 */
export type DigestVisit = {
  crmClassId: string | null;
  date: string | null;
  confirmed: boolean;
  attendance: string;
  topic: string | null;
  summary: string | null;
};

export type DigestTopicMove = {
  crmClassId: string;
  title: string;
  fromPercent: number | null;
  toPercent: number;
};

export type FamilyWeekDigest = {
  from: string;
  to: string;
  lessons: number;
  attended: number;
  topics: Array<{ title: string; fromPercent: number | null; toPercent: number; mastered: boolean }>;
  /** One sentence for the parent to say to the child, from the latest confirmed lesson. */
  supportPhrase: string | null;
  /** The day-of-week tip on how to help; rotates so the parent sees a new one each day. */
  tip: string;
};

const aqtobeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit", day: "2-digit" });

export const PARENT_SUPPORT_TIPS = [
  "Попросите сыграть куплет за ужином — и дослушайте до конца.",
  "Не поправляйте во время игры. Скажите, что получилось лучше всего.",
  "Спросите, какая тема сейчас в секторе, и пусть покажет её.",
  "Пять минут каждый день важнее часа в субботу. Напомните мягко.",
  "Снимите на телефон, как получается сейчас, — через месяц сравните вместе.",
  "Похвалите за то, что взял инструмент, а не только за результат.",
  "Спросите преподавателя на уроке, что хвалить дома на этой неделе.",
] as const;

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[1] : parts[0];
}

export function buildFamilyWeekDigest(input: {
  childName: string;
  visits: DigestVisit[];
  topicMoves: DigestTopicMove[];
  now?: Date;
}): FamilyWeekDigest {
  const now = input.now ?? new Date();
  const to = aqtobeDay.format(now);
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = aqtobeDay.format(fromDate);
  const week = input.visits.filter((visit) => visit.confirmed && visit.date && aqtobeDay.format(new Date(visit.date)) >= from);
  const weekIds = new Set(week.map((visit) => visit.crmClassId).filter(Boolean));
  const topics = input.topicMoves
    .filter((move) => weekIds.has(move.crmClassId))
    .map((move) => ({ title: move.title, fromPercent: move.fromPercent, toPercent: move.toPercent, mastered: move.toPercent === 100 }));
  const latest = [...input.visits]
    .filter((visit) => visit.confirmed && visit.date && ["present", "late"].includes(visit.attendance))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] ?? null;
  const latestMove = latest ? input.topicMoves.filter((move) => move.crmClassId === latest.crmClassId).sort((a, b) => b.toPercent - a.toPercent)[0] ?? null : null;
  const name = shortName(input.childName);
  const supportPhrase = latest
    ? latestMove
      ? latestMove.toPercent === 100
        ? `${name} закрыл тему «${latestMove.title}» — скажите, что заметили.`
        : `${name} продвинул «${latestMove.title}» до ${latestMove.toPercent} % — скажите ему об этом.`
      : latest.topic
        ? `На последнем уроке ${name} разбирал «${latest.topic}» — попросите показать.`
        : null
    : null;
  const dayIndex = new Date(now.getTime() + 5 * 60 * 60 * 1000).getUTCDay();
  return {
    from,
    to,
    lessons: week.length,
    attended: week.filter((visit) => ["present", "late"].includes(visit.attendance)).length,
    topics,
    supportPhrase,
    tip: PARENT_SUPPORT_TIPS[dayIndex % PARENT_SUPPORT_TIPS.length]!,
  };
}
