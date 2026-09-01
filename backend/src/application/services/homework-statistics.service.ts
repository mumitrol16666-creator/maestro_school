import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import {
  calculateHomeworkStatistics,
  type HomeworkStatisticsFact,
} from "../../domain/homework-statistics.js";
import { formatFio } from "../../domain/name.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

const AQTOBE_OFFSET_MS = 5 * 60 * 60 * 1_000;

const statisticRecipientSelect = {
  id: true,
  crmStudentId: true,
  studentUserId: true,
  state: true,
  currentCycle: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      avatar: true,
    },
  },
  assignment: {
    select: {
      assignedAt: true,
      topic: {
        select: {
          crmStudentId: true,
          crmGroupId: true,
          direction: {
            select: {
              id: true,
              crmDirectionId: true,
              title: true,
            },
          },
        },
      },
    },
  },
  _count: { select: { attempts: true } },
} satisfies Prisma.LearningHomeworkRecipientSelect;

type StatisticRecipient = Prisma.LearningHomeworkRecipientGetPayload<{
  select: typeof statisticRecipientSelect;
}>;

type StatisticsRow = HomeworkStatisticsFact & {
  recipientId: string;
  crmStudentId: string;
  studentUserId: string | null;
  displayName: string;
  avatar: string | null;
  crmGroupId: string | null;
  direction: {
    id: string;
    crmDirectionId: string | null;
    title: string;
  };
};

type HomeworkStatisticsQuery = {
  month?: string;
  directionId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

type NameRef = { name: string; avatar?: string | null; userId?: string | null };

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new BadRequestError("Укажите месяц в формате ГГГГ-ММ");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (year < 2020 || year > 2100 || monthIndex < 0 || monthIndex > 11) {
    throw new BadRequestError("Укажите корректный месяц");
  }
  return {
    month,
    start: new Date(Date.UTC(year, monthIndex, 1) - AQTOBE_OFFSET_MS),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - AQTOBE_OFFSET_MS),
  };
}

function normalizedSearch(value?: string) {
  return value?.trim().toLocaleLowerCase("ru") ?? "";
}

function shortGroupName(crmGroupId: string) {
  return `Учебная группа · ${crmGroupId.slice(-6)}`;
}

function stats(rows: readonly StatisticsRow[]) {
  return calculateHomeworkStatistics(rows);
}

function groupRows<T extends string>(rows: readonly StatisticsRow[], key: (row: StatisticsRow) => T | null) {
  const grouped = new Map<T, StatisticsRow[]>();
  for (const row of rows) {
    const groupKey = key(row);
    if (!groupKey) continue;
    const current = grouped.get(groupKey) ?? [];
    current.push(row);
    grouped.set(groupKey, current);
  }
  return grouped;
}

async function loadRows(
  range: ReturnType<typeof monthRange>,
  scopeWhere: Prisma.LearningHomeworkRecipientWhereInput,
  suppliedStudentNames: Map<string, NameRef> = new Map(),
) {
  const recipients = await prisma.learningHomeworkRecipient.findMany({
    where: {
      AND: [
        scopeWhere,
        { assignment: { assignedAt: { gte: range.start, lt: range.end } } },
      ],
    },
    select: statisticRecipientSelect,
    orderBy: [{ assignment: { assignedAt: "desc" } }, { id: "asc" }],
  });
  const missingCrmIds = [...new Set(recipients
    .filter((recipient) => !recipient.student && !suppliedStudentNames.has(recipient.crmStudentId))
    .map((recipient) => recipient.crmStudentId))];
  const linkedUsers = missingCrmIds.length
    ? await prisma.user.findMany({
        where: { crmStudentId: { in: missingCrmIds }, deletedAt: null },
        select: {
          id: true,
          crmStudentId: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
        },
      })
    : [];
  const linkedByCrm = new Map(linkedUsers.flatMap((user) => user.crmStudentId ? [[user.crmStudentId, user]] : []));

  return recipients.map((recipient): StatisticsRow => {
    const supplied = suppliedStudentNames.get(recipient.crmStudentId);
    const linked = linkedByCrm.get(recipient.crmStudentId);
    const displayName = supplied?.name
      || (recipient.student ? formatFio(recipient.student) : "")
      || (linked ? formatFio(linked) : "")
      || "Ученик Maestro";
    return {
      recipientId: recipient.id,
      crmStudentId: recipient.crmStudentId,
      studentUserId: recipient.studentUserId ?? supplied?.userId ?? linked?.id ?? null,
      displayName,
      avatar: supplied?.avatar ?? recipient.student?.avatar ?? linked?.avatar ?? null,
      crmGroupId: recipient.assignment.topic.crmGroupId,
      direction: recipient.assignment.topic.direction,
      state: recipient.state,
      currentCycle: recipient.currentCycle,
      attemptCount: recipient._count.attempts,
    };
  });
}

async function storedGroupNames(rows: readonly StatisticsRow[]) {
  const groupIds = [...new Set(rows.flatMap((row) => row.crmGroupId ? [row.crmGroupId] : []))];
  if (!groupIds.length) return new Map<string, string>();
  const conversations = await prisma.learningConversation.findMany({
    where: { crmGroupId: { in: groupIds }, title: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { crmGroupId: true, title: true },
  });
  const result = new Map<string, string>();
  for (const conversation of conversations) {
    if (conversation.crmGroupId && conversation.title && !result.has(conversation.crmGroupId)) {
      result.set(conversation.crmGroupId, conversation.title);
    }
  }
  return result;
}

function responseForRows(
  allRows: readonly StatisticsRow[],
  query: HomeworkStatisticsQuery,
  groupNames: Map<string, string>,
) {
  const directionId = query.directionId ?? null;
  const rows = directionId
    ? allRows.filter((row) => row.direction.id === directionId)
    : [...allRows];
  const directionGroups = groupRows(allRows, (row) => row.direction.id);
  const studentGroups = groupRows(rows, (row) => row.crmStudentId);
  const crmGroupRows = groupRows(rows, (row) => row.crmGroupId);
  const search = normalizedSearch(query.search);
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(10, query.limit ?? 30));
  const studentItems = [...studentGroups.entries()]
    .map(([crmStudentId, studentRows]) => {
      const directions = groupRows(studentRows, (row) => row.direction.id);
      const representative = studentRows[0];
      return {
        id: representative.studentUserId ?? `crm:${crmStudentId}`,
        userId: representative.studentUserId,
        crmStudentId,
        displayName: representative.displayName,
        avatar: representative.avatar,
        metrics: stats(studentRows),
        directions: [...directions.values()].map((directionRows) => ({
          id: directionRows[0].direction.id,
          crmDirectionId: directionRows[0].direction.crmDirectionId,
          title: directionRows[0].direction.title,
          metrics: stats(directionRows),
        })).sort((left, right) => left.title.localeCompare(right.title, "ru")),
      };
    })
    .filter((student) => !search || student.displayName.toLocaleLowerCase("ru").includes(search))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
  const startIndex = (page - 1) * limit;

  return {
    period: {
      month: query.month ?? aqtobeMonthKey(),
      basis: "assigned_at" as const,
    },
    filters: { directionId },
    totals: stats(rows),
    directions: [...directionGroups.values()].map((directionRows) => ({
      id: directionRows[0].direction.id,
      crmDirectionId: directionRows[0].direction.crmDirectionId,
      title: directionRows[0].direction.title,
      metrics: stats(directionRows),
    })).sort((left, right) => left.title.localeCompare(right.title, "ru")),
    groups: [...crmGroupRows.entries()].map(([crmGroupId, groupedRows]) => ({
      crmGroupId,
      name: groupNames.get(crmGroupId) ?? shortGroupName(crmGroupId),
      metrics: stats(groupedRows),
      directions: [...groupRows(groupedRows, (row) => row.direction.id).values()].map((directionRows) => ({
        id: directionRows[0].direction.id,
        crmDirectionId: directionRows[0].direction.crmDirectionId,
        title: directionRows[0].direction.title,
        metrics: stats(directionRows),
      })),
    })).sort((left, right) => left.name.localeCompare(right.name, "ru")),
    students: {
      items: studentItems.slice(startIndex, startIndex + limit),
      total: studentItems.length,
      page,
      limit,
      pages: Math.max(1, Math.ceil(studentItems.length / limit)),
    },
  };
}

export async function getAdminHomeworkStatistics(query: HomeworkStatisticsQuery) {
  const normalizedQuery = { ...query, month: query.month ?? aqtobeMonthKey() };
  const range = monthRange(normalizedQuery.month);
  const rows = await loadRows(range, {});
  return responseForRows(rows, normalizedQuery, await storedGroupNames(rows));
}

export async function getTeacherHomeworkStatistics(
  teacherUserId: string,
  query: HomeworkStatisticsQuery,
) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const [studentRoster, groupRoster] = await Promise.all([
    fetchTeacherStudents(crmTeacherId),
    fetchTeacherGroups(crmTeacherId),
  ]);
  const individualScopes: Prisma.LearningTopicWhereInput[] = studentRoster.students.flatMap((student) => (
    student.directions.length ? [{
      crmStudentId: student.crmStudentId,
      direction: { title: { in: student.directions } },
    }] : []
  ));
  const groupScopes: Prisma.LearningTopicWhereInput[] = groupRoster.groups.flatMap((group) => (
    group.direction ? [{
      crmGroupId: group.crmGroupId,
      direction: { title: group.direction },
    }] : []
  ));
  const topicScopes = [...individualScopes, ...groupScopes];
  const normalizedQuery = { ...query, month: query.month ?? aqtobeMonthKey() };
  if (!topicScopes.length) {
    return responseForRows([], normalizedQuery, new Map());
  }
  const studentNames = new Map(studentRoster.students.map((student) => [student.crmStudentId, {
    name: student.name,
    avatar: student.avatarUrl ?? null,
    userId: student.appUserId ?? null,
  }]));
  const rows = await loadRows(
    monthRange(normalizedQuery.month),
    { assignment: { topic: { OR: topicScopes } } },
    studentNames,
  );
  const groupNames = new Map(groupRoster.groups.map((group) => [group.crmGroupId, group.name]));
  return responseForRows(rows, { ...normalizedQuery, limit: 100 }, groupNames);
}

export async function getStudentHomeworkStatistics(
  studentUserId: string,
  query: HomeworkStatisticsQuery,
) {
  const student = await prisma.user.findUnique({
    where: { id: studentUserId },
    select: {
      id: true,
      crmStudentId: true,
      firstName: true,
      lastName: true,
      middleName: true,
      avatar: true,
    },
  });
  if (!student?.crmStudentId) {
    throw new BadRequestError(
      "Профиль школы не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }
  const normalizedQuery = { ...query, month: query.month ?? aqtobeMonthKey() };
  const names = new Map([[student.crmStudentId, {
    name: formatFio(student) || "Ученик Maestro",
    avatar: student.avatar,
    userId: student.id,
  }]]);
  const rows = await loadRows(monthRange(normalizedQuery.month), {
    OR: [
      { studentUserId },
      { crmStudentId: student.crmStudentId },
    ],
  }, names);
  return responseForRows(
    rows,
    { ...normalizedQuery, limit: 10 },
    await storedGroupNames(rows),
  );
}
