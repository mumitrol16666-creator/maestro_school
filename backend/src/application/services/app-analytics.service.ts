import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";

const AQTOBE_OFFSET_MS = 5 * 60 * 60 * 1_000;

type PeriodRange = {
  key: string;
  start: Date;
  end: Date;
};

type UsageAggregateRow = {
  active_students: bigint;
  logins: bigint;
  sessions: bigint;
  page_views: bigint;
  homework_views: bigint;
};

function number(value: bigint | number | null | undefined) {
  return Number(value ?? 0);
}

export function appAnalyticsMonthRange(key: string): PeriodRange {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new BadRequestError("Укажите месяц в формате ГГГГ-ММ");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 2020 || year > 2100 || monthIndex < 0 || monthIndex > 11) {
    throw new BadRequestError("Укажите корректный месяц");
  }
  return {
    key,
    start: new Date(Date.UTC(year, monthIndex, 1) - AQTOBE_OFFSET_MS),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - AQTOBE_OFFSET_MS),
  };
}

function shiftMonth(key: string, amount: number) {
  const range = appAnalyticsMonthRange(key);
  const local = new Date(range.start.getTime() + AQTOBE_OFFSET_MS);
  const shifted = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function periodMetrics(range: PeriodRange) {
  const [usage] = await prisma.$queryRaw<UsageAggregateRow[]>(Prisma.sql`
    SELECT
      COUNT(DISTINCT "user_id") AS active_students,
      COUNT(*) FILTER (WHERE "event_type" = 'login') AS logins,
      COUNT(DISTINCT "session_id") FILTER (WHERE "session_id" IS NOT NULL) AS sessions,
      COUNT(*) FILTER (WHERE "event_type" = 'page_view') AS page_views,
      COUNT(*) FILTER (WHERE "event_type" = 'page_view' AND "section" = 'homework') AS homework_views
    FROM "app_usage_events"
    WHERE "occurred_at" >= ${range.start} AND "occurred_at" < ${range.end}
  `);
  const [legacyHomework, learningHomework, onlineHomework, testsCompleted] = await Promise.all([
    prisma.homeworkSubmission.count({
      where: { createdAt: { gte: range.start, lt: range.end } },
    }),
    prisma.learningHomeworkAttempt.count({
      where: { submittedAt: { gte: range.start, lt: range.end } },
    }),
    prisma.onlineLessonAssignmentSubmission.count({
      where: { createdAt: { gte: range.start, lt: range.end } },
    }),
    prisma.preparedTestAttempt.count({
      where: { createdAt: { gte: range.start, lt: range.end }, passed: true },
    }),
  ]);
  return {
    activeStudents: number(usage?.active_students),
    logins: number(usage?.logins),
    sessions: number(usage?.sessions),
    pageViews: number(usage?.page_views),
    homeworkViews: number(usage?.homework_views),
    homeworkSubmissions: legacyHomework + learningHomework + onlineHomework,
    testsCompleted,
  };
}

type StudentOutcome = {
  homeworkSubmissions: number;
  testsCompleted: number;
};

type RecentUsageEvent = {
  id: string;
  userId: string;
  eventType: string;
  section: string;
  path: string | null;
  occurredAt: Date;
};

async function studentOutcomeMap(studentIds: string[], range: PeriodRange) {
  const result = new Map<string, StudentOutcome>(studentIds.map((id) => [id, {
    homeworkSubmissions: 0,
    testsCompleted: 0,
  }]));
  if (!studentIds.length) return result;
  const [legacy, learning, online, tests] = await Promise.all([
    prisma.homeworkSubmission.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, createdAt: { gte: range.start, lt: range.end } },
      _count: { _all: true },
    }),
    prisma.learningHomeworkAttempt.groupBy({
      by: ["submittedById"],
      where: {
        submittedById: { in: studentIds },
        submittedAt: { gte: range.start, lt: range.end },
      },
      _count: { _all: true },
    }),
    prisma.onlineLessonAssignmentSubmission.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, createdAt: { gte: range.start, lt: range.end } },
      _count: { _all: true },
    }),
    prisma.preparedTestAttempt.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, createdAt: { gte: range.start, lt: range.end }, passed: true },
      _count: { _all: true },
    }),
  ]);
  for (const row of legacy) result.get(row.studentId)!.homeworkSubmissions += row._count._all;
  for (const row of learning) {
    if (row.submittedById) result.get(row.submittedById)!.homeworkSubmissions += row._count._all;
  }
  for (const row of online) result.get(row.studentId)!.homeworkSubmissions += row._count._all;
  for (const row of tests) result.get(row.studentId)!.testsCompleted += row._count._all;
  return result;
}

function usageDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aqtobe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function emptyStudentUsage() {
  return {
    logins: 0,
    sessions: new Set<string>(),
    pageViews: 0,
    homeworkViews: 0,
    activeDays: new Set<string>(),
    sections: new Map<string, number>(),
  };
}

function aggregateStudentUsage(events: Array<{
  userId: string;
  eventType: string;
  section: string;
  sessionId: string | null;
  occurredAt: Date;
}>, studentIds: string[]) {
  const result = new Map(studentIds.map((id) => [id, emptyStudentUsage()]));
  for (const event of events) {
    const row = result.get(event.userId);
    if (!row) continue;
    row.activeDays.add(usageDay(event.occurredAt));
    if (event.eventType === "login") row.logins += 1;
    if (event.sessionId) row.sessions.add(event.sessionId);
    if (event.eventType === "page_view") {
      row.pageViews += 1;
      if (event.section === "homework") row.homeworkViews += 1;
      row.sections.set(event.section, (row.sections.get(event.section) ?? 0) + 1);
    }
  }
  return result;
}

function studentMetricView(
  usage: ReturnType<typeof emptyStudentUsage>,
  outcome: StudentOutcome,
) {
  return {
    logins: usage.logins,
    sessions: usage.sessions.size,
    activeDays: usage.activeDays.size,
    pageViews: usage.pageViews,
    homeworkViews: usage.homeworkViews,
    homeworkSubmissions: outcome.homeworkSubmissions,
    testsCompleted: outcome.testsCompleted,
  };
}

async function recentStudentUsageEvents(studentIds: string[]) {
  if (!studentIds.length) return [];
  const studentUuidList = Prisma.join(studentIds.map((studentId) => Prisma.sql`${studentId}::uuid`));
  return prisma.$queryRaw<RecentUsageEvent[]>(Prisma.sql`
    SELECT
      ranked."id",
      ranked."userId",
      ranked."eventType",
      ranked."section",
      ranked."path",
      ranked."occurredAt"
    FROM (
      SELECT
        "id",
        "user_id" AS "userId",
        "event_type" AS "eventType",
        "section",
        "path",
        "occurred_at" AS "occurredAt",
        ROW_NUMBER() OVER (
          PARTITION BY "user_id"
          ORDER BY "occurred_at" DESC, "id" DESC
        ) AS "rowNumber"
      FROM "app_usage_events"
      WHERE "user_id" IN (${studentUuidList})
    ) AS ranked
    WHERE ranked."rowNumber" <= 8
    ORDER BY ranked."occurredAt" DESC, ranked."id" DESC
  `);
}

export async function getAppAnalytics(params: {
  month?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const month = params.month ?? aqtobeMonthKey();
  const current = appAnalyticsMonthRange(month);
  const previous = appAnalyticsMonthRange(shiftMonth(month, -1));
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(10, params.limit ?? 30));
  const search = params.search?.trim() ?? "";
  const studentWhere: Prisma.UserWhereInput = {
    role: { slug: "student" },
    isActive: true,
    deletedAt: null,
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { middleName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { login: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const seriesKeys = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5));
  const [currentSummary, previousSummary, series, tracking, totalStudents, students] = await Promise.all([
    periodMetrics(current),
    periodMetrics(previous),
    Promise.all(seriesKeys.map(async (key) => ({ month: key, ...(await periodMetrics(appAnalyticsMonthRange(key))) }))),
    prisma.appUsageEvent.aggregate({ _min: { occurredAt: true } }),
    prisma.user.count({ where: studentWhere }),
    prisma.user.findMany({
      where: studentWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatar: true,
        crmStudentId: true,
      },
    }),
  ]);
  const studentIds = students.map((student) => student.id);
  const [usageEvents, currentOutcomes, previousOutcomes, latestEvents, recentEvents] = await Promise.all([
    prisma.appUsageEvent.findMany({
      where: { userId: { in: studentIds }, occurredAt: { gte: previous.start, lt: current.end } },
      select: { userId: true, eventType: true, section: true, sessionId: true, occurredAt: true },
    }),
    studentOutcomeMap(studentIds, current),
    studentOutcomeMap(studentIds, previous),
    prisma.appUsageEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: studentIds } },
      _max: { occurredAt: true },
    }),
    recentStudentUsageEvents(studentIds),
  ]);
  const currentUsage = aggregateStudentUsage(
    usageEvents.filter((event) => event.occurredAt >= current.start),
    studentIds,
  );
  const previousUsage = aggregateStudentUsage(
    usageEvents.filter((event) => event.occurredAt < current.start),
    studentIds,
  );
  const latestByStudent = new Map(latestEvents.map((row) => [row.userId, row._max.occurredAt]));
  const recentByStudent = new Map<string, typeof recentEvents>();
  for (const event of recentEvents) {
    const list = recentByStudent.get(event.userId) ?? [];
    if (list.length < 8) list.push(event);
    recentByStudent.set(event.userId, list);
  }

  return {
    period: {
      month,
      previousMonth: previous.key,
      trackingStartedAt: tracking._min.occurredAt,
    },
    summary: {
      current: currentSummary,
      previous: previousSummary,
    },
    series,
    students: {
      items: students.map((student) => {
        const currentRow = currentUsage.get(student.id)!;
        return {
          id: student.id,
          displayName: formatFio(student) || "Ученик Maestro",
          avatar: student.avatar,
          crmStudentId: student.crmStudentId,
          lastActiveAt: latestByStudent.get(student.id) ?? null,
          current: studentMetricView(currentRow, currentOutcomes.get(student.id)!),
          previous: studentMetricView(previousUsage.get(student.id)!, previousOutcomes.get(student.id)!),
          sections: [...currentRow.sections.entries()]
            .map(([section, views]) => ({ section, views }))
            .sort((left, right) => right.views - left.views),
          recentEvents: (recentByStudent.get(student.id) ?? []).map((event) => ({
            id: event.id,
            eventType: event.eventType,
            section: event.section,
            path: event.path,
            occurredAt: event.occurredAt,
          })),
        };
      }),
      page,
      limit,
      total: totalStudents,
      pages: Math.max(1, Math.ceil(totalStudents / limit)),
    },
  };
}
