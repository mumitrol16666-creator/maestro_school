import type { StudentOfflineSummary } from "@/types/school-offline";

const STORAGE_PREFIX = "maestro_school_seen";
export const SCHOOL_ALERTS_UPDATED_EVENT = "maestro:school-alerts-updated";

type SeenState = {
  homework: string[];
  reports: string[];
};

export type SchoolAlertCounts = {
  homework: number;
  reports: number;
  totalUnread: number;
  todayLessons: number;
  tomorrowLessons: number;
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function emptySeen(): SeenState {
  return { homework: [], reports: [] };
}

function readSeen(userId: string): SeenState {
  if (typeof window === "undefined") return emptySeen();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "{}") as Partial<SeenState>;
    return {
      homework: Array.isArray(parsed.homework) ? parsed.homework : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch {
    return emptySeen();
  }
}

function lessonDay(value: string) {
  return value.slice(0, 10);
}

function localDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentCompletedLessons(data: StudentOfflineSummary) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);

  return data.lessonHistory.filter(
    (lesson) => lesson.status === "completed" && new Date(lesson.date).getTime() >= cutoff.getTime(),
  );
}

export function homeworkAlertIds(data: StudentOfflineSummary) {
  return recentCompletedLessons(data)
    .filter((lesson) => Boolean(lesson.homework))
    .map((lesson) => `${lesson.crmClassId}:homework`);
}

export function reportAlertIds(data: StudentOfflineSummary) {
  return recentCompletedLessons(data)
    .filter((lesson) =>
      Boolean(lesson.topic || lesson.lessonGoals || lesson.lessonSummary || lesson.nextLessonFocus),
    )
    .map((lesson) => `${lesson.crmClassId}:report`);
}

export function getSchoolAlertCounts(userId: string, data: StudentOfflineSummary): SchoolAlertCounts {
  const seen = readSeen(userId);
  const seenHomework = new Set(seen.homework);
  const seenReports = new Set(seen.reports);
  const homework = homeworkAlertIds(data).filter((id) => !seenHomework.has(id)).length;
  const reports = reportAlertIds(data).filter((id) => !seenReports.has(id)).length;
  const today = localDay();
  const tomorrow = localDay(1);

  return {
    homework,
    reports,
    totalUnread: homework + reports,
    todayLessons: data.upcomingLessons.filter((lesson) => lessonDay(lesson.date) === today).length,
    tomorrowLessons: data.upcomingLessons.filter((lesson) => lessonDay(lesson.date) === tomorrow).length,
  };
}

export function markSchoolAlertsSeen(
  userId: string,
  data: StudentOfflineSummary,
  category: "homework" | "reports",
) {
  if (typeof window === "undefined") return;
  const seen = readSeen(userId);
  const ids = category === "homework" ? homeworkAlertIds(data) : reportAlertIds(data);
  seen[category] = Array.from(new Set([...seen[category], ...ids])).slice(-250);
  window.localStorage.setItem(storageKey(userId), JSON.stringify(seen));
  window.dispatchEvent(new CustomEvent(SCHOOL_ALERTS_UPDATED_EVENT));
}

