/**
 * Plan 5.1: the one card the student's home opens with — the nearest school lesson and what to
 * do before it. Pure: the service hands in the upcoming lessons and the active tasks.
 */
export type TodayLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string | null;
  teacherName?: string | null;
  roomName?: string | null;
  groupName?: string | null;
  deliveryFormat?: string | null;
};

export type TodayTask = {
  id: string;
  title: string;
  status: string;
  source?: string | null;
  target?: { href?: string | null } | null;
};

export type StudentToday = {
  nextLesson: (TodayLesson & { isToday: boolean; isTomorrow: boolean }) | null;
  /** Tasks to finish before the lesson: homework and revisions first, then theory tests. */
  tasks: TodayTask[];
  tasksTotal: number;
};

const aqtobeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit", day: "2-digit" });

export function aqtobeDayOf(value: string | Date) {
  return aqtobeDay.format(new Date(value));
}

function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00+05:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return aqtobeDay.format(date);
}

export function buildStudentToday(input: {
  upcomingLessons: TodayLesson[];
  tasks: TodayTask[];
  now?: Date;
  limit?: number;
}): StudentToday {
  const now = input.now ?? new Date();
  const today = aqtobeDayOf(now);
  const tomorrow = shiftDay(today, 1);
  const next = [...input.upcomingLessons]
    .filter((lesson) => !lesson.status || lesson.status === "scheduled" || lesson.status === "started")
    .sort((a, b) => aqtobeDayOf(a.date).localeCompare(aqtobeDayOf(b.date)) || a.startTime.localeCompare(b.startTime))[0] ?? null;
  const open = input.tasks.filter((task) => ["todo", "needs_revision"].includes(task.status));
  const rank = (task: TodayTask) => (task.status === "needs_revision" ? 0 : task.source === "theory" ? 2 : 1);
  const ordered = [...open].sort((a, b) => rank(a) - rank(b));
  return {
    nextLesson: next
      ? { ...next, isToday: aqtobeDayOf(next.date) === today, isTomorrow: aqtobeDayOf(next.date) === tomorrow }
      : null,
    tasks: ordered.slice(0, input.limit ?? 3),
    tasksTotal: open.length,
  };
}

/** Plan 5.2: unread notifications that deserve a banner on the home and in «Обучение». */
export const STUDENT_BANNER_TYPES = [
  "homework_assigned",
  "offline_lesson_report_ready",
  "sector_proposal_decided",
  "sector_exam_updated",
] as const;
