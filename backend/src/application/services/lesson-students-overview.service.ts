import { prisma } from "../../infrastructure/database/prisma.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { getTeacherOfflineClassStudents } from "./teacher-offline.service.js";
import { fetchTeacherRosterForAccess } from "./teacher-substitution.service.js";
import { listPublishedLearningPlansV2 } from "./learning-plan-v2.service.js";
import { getStudentPointsReadModel } from "./points.service.js";
import { getWeeklyLeagueOverview } from "./weekly-league.service.js";

/**
 * Plan 1.14: the strip above the lesson steps — for every student of the lesson the sector and its
 * percent, LEVEL by Points, place in this week's league, streak of weeks, the school's programme
 * level from CRM and recent attendance. Read-only; the teacher of the lesson sees it.
 */
const RECENT_ATTENDANCE = 8;

type RosterStudent = {
  crmStudentId?: string;
  appUserId?: string | null;
  name?: string;
};

type CrmRosterStudent = {
  crmStudentId: string;
  learningLevel?: string | null;
  directions?: string[];
  attendanceHistory?: Array<{ crmClassId: string; date: string; attended: boolean; attendanceStatus: string }>;
};

export type LessonStudentOverview = {
  crmStudentId: string;
  name: string;
  appLinked: boolean;
  /** CRM directions of the student: the sector editor opened from the lesson needs them. */
  directions: string[];
  programLevel: string | null;
  sector: { sequence: number; percent: number; completed: number; total: number; direction: string } | null;
  level: {
    level: number;
    code: string;
    minPoints: number;
    title: string;
    tone: string;
    emblem: string;
    points: number;
    progressPercent: number;
    pointsToNext: number;
    isMaxLevel: boolean;
  } | null;
  league: { position: number | null; participantCount: number; xp: number; goalXp: number } | null;
  streakWeeks: number | null;
  attendance: {
    attended: number;
    total: number;
    recent: Array<{ date: string; attendanceStatus: string; attended: boolean }>;
  } | null;
  lastLessonDate: string | null;
};

async function teacherRosterStudents(appUserId: string) {
  try {
    const crmTeacherId = await requireCrmTeacherId(appUserId);
    const { students, groups } = await fetchTeacherRosterForAccess(crmTeacherId);
    const byId = new Map<string, CrmRosterStudent>();
    const groupDirections = new Map(groups.groups.map((group) => [group.crmGroupId, (group as { direction?: string | null }).direction ?? null]));
    for (const group of groups.groups) {
      for (const student of group.students as CrmRosterStudent[]) byId.set(student.crmStudentId, student);
    }
    // Direct students carry the fuller record (level, attendance), so they win.
    for (const student of students.students as CrmRosterStudent[]) byId.set(student.crmStudentId, student);
    return { byId, groupDirections };
  } catch {
    return { byId: new Map<string, CrmRosterStudent>(), groupDirections: new Map<string, string | null>() };
  }
}

async function economyOf(appUserId: string | null, now: Date) {
  if (!appUserId) return { level: null, league: null, streakWeeks: null };
  const [points, league] = await Promise.all([
    getStudentPointsReadModel(appUserId, now).catch(() => null),
    getWeeklyLeagueOverview(appUserId, 0, now).catch(() => null),
  ]);
  const level = points?.level
    ? {
        level: points.level.level.level,
        code: points.level.level.code,
        minPoints: points.level.level.minPoints,
        title: points.level.level.title,
        tone: points.level.level.tone,
        emblem: points.level.level.emblem,
        points: points.level.points,
        progressPercent: points.level.progressPercent,
        pointsToNext: points.level.pointsToNext,
        isMaxLevel: points.level.isMaxLevel,
      }
    : null;
  const current = league?.economyV2Enabled ? league.currentStudent : null;
  return {
    level,
    league: current
      ? { position: current.position, participantCount: league!.participantCount, xp: current.xp, goalXp: current.goalXp }
      : null,
    streakWeeks: current ? current.streakWeeks : null,
  };
}

export async function getLessonStudentsOverview(teacherUserId: string, crmClassId: string, now = new Date()) {
  const roster = await getTeacherOfflineClassStudents(teacherUserId, crmClassId) as {
    students?: RosterStudent[];
    group?: { crmGroupId?: string | null } | null;
  };
  const students = (roster.students ?? []).filter((item): item is RosterStudent & { crmStudentId: string } => Boolean(item.crmStudentId));
  const groupIds = roster.group?.crmGroupId ? [roster.group.crmGroupId] : [];
  const { byId: crmRoster, groupDirections } = await teacherRosterStudents(teacherUserId);
  const linkedUsers = await prisma.user.findMany({
    where: { crmStudentId: { in: students.map((item) => item.crmStudentId) }, deletedAt: null, isActive: true },
    select: { id: true, crmStudentId: true },
  });
  const appUserIds = new Map(linkedUsers.map((user) => [user.crmStudentId!, user.id]));

  const items = await Promise.all(students.map(async (student): Promise<LessonStudentOverview> => {
    const appUserId = student.appUserId ?? appUserIds.get(student.crmStudentId) ?? null;
    const crm = crmRoster.get(student.crmStudentId);
    const [sectors, economy] = await Promise.all([
      listPublishedLearningPlansV2(student.crmStudentId, groupIds).catch(() => []),
      economyOf(appUserId, now),
    ]);
    const sector = sectors.find((item) => item.status !== "closed") ?? null;
    const history = (crm?.attendanceHistory ?? []).filter((item) => item.crmClassId !== crmClassId);
    const recent = history.slice(0, RECENT_ATTENDANCE);
    return {
      crmStudentId: student.crmStudentId,
      name: student.name ?? "Ученик",
      appLinked: Boolean(appUserId),
      directions: crm?.directions ?? [],
      programLevel: crm?.learningLevel?.trim() || null,
      sector: sector
        ? {
            sequence: sector.sequence,
            percent: sector.progress.percent,
            completed: sector.progress.completed,
            total: sector.progress.total,
            direction: sector.direction.title,
          }
        : null,
      ...economy,
      attendance: crm
        ? {
            attended: recent.filter((item) => ["present", "late"].includes(item.attendanceStatus)).length,
            total: recent.length,
            recent: recent.map((item) => ({ date: item.date, attendanceStatus: item.attendanceStatus, attended: item.attended })),
          }
        : null,
      lastLessonDate: history[0]?.date ?? null,
    };
  }));

  const crmGroupId = groupIds[0] ?? null;
  return {
    crmClassId,
    generatedAt: now.toISOString(),
    group: crmGroupId ? { crmGroupId, direction: groupDirections.get(crmGroupId) ?? null } : null,
    students: items,
  };
}
