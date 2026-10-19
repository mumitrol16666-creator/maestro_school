import { productFeatureConfig } from "../../config/product-features.js";
import {
  aqtobeDateKey,
  birthdayAge,
  daysUntilBirthday,
  lessonPhase,
  openReport,
  proposalStale,
} from "../../domain/teacher-today.js";
import { fetchTeacherGroups, fetchTeacherStudents } from "../../infrastructure/crm/crm-client.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { countUnreadLearningMessages } from "./learning-dialog.service.js";
import { countUnreadMessages } from "./message-mailbox.service.js";
import { getTeacherOfflineAgenda } from "./teacher-offline.service.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

/**
 * The teacher's working day on one screen (02 §3.2): today's lessons, reports
 * still owed, homework to check at today's lessons, student proposals,
 * unread messages and birthdays — with what is overdue marked as such.
 * Everything is read; nothing here changes data.
 */

const AGENDA_LOOKBACK_DAYS = 7;
const MAX_PROPOSALS = 5;

type AgendaClass = {
  crmClassId?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  classType?: string | null;
  deliveryFormat?: string | null;
  crmIndividualStudentId?: string | null;
  group?: { crmGroupId?: string; name?: string } | null;
  room?: { name?: string } | null;
  trialBooking?: unknown;
};

function dayShift(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

async function unreadMessages(teacherUserId: string) {
  try {
    return productFeatureConfig.flags.learningDialogsV2
      ? await countUnreadLearningMessages({ userId: teacherUserId, roleSlug: "teacher" })
      : await countUnreadMessages(teacherUserId, "teacher");
  } catch {
    return null;
  }
}

export async function getTeacherToday(teacherUserId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const todayKey = aqtobeDateKey(now);
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);

  const [agendaResult, studentsResult, groupsResult, unread] = await Promise.all([
    getTeacherOfflineAgenda(teacherUserId, {
      from: dayShift(now, -AGENDA_LOOKBACK_DAYS).toISOString(),
      to: dayShift(now, 1).toISOString(),
    }).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const })),
    fetchTeacherStudents(crmTeacherId).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const })),
    fetchTeacherGroups(crmTeacherId).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const })),
    unreadMessages(teacherUserId),
  ]);

  const classes = (agendaResult.ok ? agendaResult.value.classes : []) as AgendaClass[];
  const agendaFromCache = agendaResult.ok
    && (agendaResult.value as { integration?: { state?: string } }).integration?.state === "pending_sync";
  const students = studentsResult.ok ? studentsResult.value.students : [];
  const groups = groupsResult.ok ? groupsResult.value.groups : [];

  // Who sits in which lesson: individual lessons name the student, group
  // lessons take the CRM group roster.
  const groupStudents = new Map(groups.map((group) => [
    group.crmGroupId,
    group.students.map((student) => student.crmStudentId),
  ]));
  const lessonStudents = (lesson: AgendaClass) => (
    lesson.crmIndividualStudentId
      ? [lesson.crmIndividualStudentId]
      : lesson.group?.crmGroupId ? groupStudents.get(lesson.group.crmGroupId) ?? [] : []
  );

  const todayClasses = classes
    .filter((lesson) => String(lesson.date ?? "").slice(0, 10) === todayKey && lesson.status !== "cancelled")
    .sort((left, right) => String(left.startTime ?? "").localeCompare(String(right.startTime ?? "")));

  // Homework that waits for the teacher's check at today's lessons.
  const todayStudentIds = [...new Set(todayClasses.flatMap(lessonStudents))];
  const openHomework = todayStudentIds.length
    ? await prisma.learningHomeworkRecipient.groupBy({
        by: ["crmStudentId"],
        where: {
          crmStudentId: { in: todayStudentIds },
          state: { in: ["assigned", "waiting_review", "revision"] },
          assignment: { archivedAt: null },
        },
        _count: { _all: true },
      })
    : [];
  const homeworkByStudent = new Map(openHomework.map((row) => [row.crmStudentId, row._count._all]));

  const rosterIds = students.map((student) => student.crmStudentId);
  const proposals = rosterIds.length
    ? await prisma.learningSectorProposal.findMany({
        where: { crmStudentId: { in: rosterIds }, status: "new" },
        orderBy: { createdAt: "asc" },
        include: {
          student: { select: { firstName: true, lastName: true } },
          direction: { select: { title: true } },
        },
      })
    : [];
  const studentName = new Map(students.map((student) => [student.crmStudentId, student.name]));

  const lessons = todayClasses.map((lesson) => {
    const ids = lessonStudents(lesson);
    return {
      crmClassId: String(lesson.crmClassId ?? ""),
      title: String(lesson.title ?? "Урок"),
      startTime: String(lesson.startTime ?? "").slice(0, 5),
      endTime: String(lesson.endTime ?? "").slice(0, 5),
      status: String(lesson.status ?? "scheduled"),
      phase: lessonPhase({ date: lesson.date, startTime: lesson.startTime, endTime: lesson.endTime }, now),
      kind: lesson.trialBooking ? "trial" as const : lesson.group ? "group" as const : "individual" as const,
      groupName: lesson.group?.name ?? null,
      studentName: lesson.crmIndividualStudentId ? studentName.get(lesson.crmIndividualStudentId) ?? null : null,
      roomName: lesson.room?.name ?? null,
      deliveryFormat: lesson.deliveryFormat === "online" ? "online" as const : "offline" as const,
      studentsCount: ids.length || null,
      homeworkToCheck: ids.reduce((total, id) => total + (homeworkByStudent.get(id) ?? 0), 0),
      reportOpen: Boolean(openReport(lesson, now)),
    };
  });

  const reports = classes.flatMap((lesson) => {
    const open = openReport(lesson, now);
    if (!open || !lesson.crmClassId) return [];
    return [{
      crmClassId: lesson.crmClassId,
      title: String(lesson.title ?? "Урок"),
      date: String(lesson.date ?? "").slice(0, 10),
      startTime: String(lesson.startTime ?? "").slice(0, 5),
      status: String(lesson.status ?? ""),
      groupName: lesson.group?.name ?? null,
      endedAt: open.endedAt.toISOString(),
      waitedHours: Math.floor(open.waitedMs / 3_600_000),
      overdue: open.overdue,
    }];
  }).sort((left, right) => left.endedAt.localeCompare(right.endedAt));

  const proposalItems = proposals.map((proposal) => ({
    id: proposal.id,
    crmStudentId: proposal.crmStudentId,
    studentName: studentName.get(proposal.crmStudentId)
      ?? [proposal.student.lastName, proposal.student.firstName].filter(Boolean).join(" "),
    kind: proposal.kind,
    text: proposal.text,
    direction: proposal.direction.title,
    createdAt: proposal.createdAt.toISOString(),
    stale: proposalStale(proposal.createdAt, now),
  }));

  const birthdays = students.flatMap((student) => {
    const days = daysUntilBirthday(student.dateOfBirth, now);
    if (days === null || !student.dateOfBirth) return [];
    return [{
      crmStudentId: student.crmStudentId,
      name: student.name,
      daysUntil: days,
      age: birthdayAge(student.dateOfBirth, now, days),
    }];
  }).sort((left, right) => left.daysUntil - right.daysUntil);

  const overdueReports = reports.filter((report) => report.overdue).length;
  const staleProposals = proposalItems.filter((proposal) => proposal.stale).length;
  const homeworkToday = lessons.reduce((total, lesson) => total + lesson.homeworkToCheck, 0);
  const attention = [
    overdueReports
      ? { kind: "reports_overdue" as const, tone: "danger" as const, count: overdueReports, title: "Просроченные отчёты", href: "#today-reports" }
      : null,
    reports.length - overdueReports
      ? { kind: "reports_open" as const, tone: "warning" as const, count: reports.length - overdueReports, title: "Отчёты к отправке", href: "#today-reports" }
      : null,
    staleProposals
      ? { kind: "proposals_stale" as const, tone: "danger" as const, count: staleProposals, title: "Предложения ждут больше 3 дней", href: "#today-proposals" }
      : null,
    proposalItems.length - staleProposals
      ? { kind: "proposals_new" as const, tone: "info" as const, count: proposalItems.length - staleProposals, title: "Новые предложения учеников", href: "#today-proposals" }
      : null,
    unread
      ? { kind: "messages_unread" as const, tone: "info" as const, count: unread, title: "Непрочитанные сообщения", href: "/admin/messages" }
      : null,
    homeworkToday
      ? { kind: "homework_today" as const, tone: "info" as const, count: homeworkToday, title: "ДЗ проверить на уроках сегодня", href: "#today-lessons" }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    generatedAt: now.toISOString(),
    date: todayKey,
    crm: {
      agendaAvailable: agendaResult.ok,
      agendaFromCache,
      rosterAvailable: studentsResult.ok && groupsResult.ok,
    },
    attention,
    lessons,
    reports,
    proposals: { total: proposalItems.length, items: proposalItems.slice(0, MAX_PROPOSALS) },
    messages: { unread },
    birthdays,
  };
}

export type TeacherToday = Awaited<ReturnType<typeof getTeacherToday>>;
