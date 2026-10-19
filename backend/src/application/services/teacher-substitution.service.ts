import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchTeacherGroups,
  fetchTeacherOfflineClasses,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";

/**
 * Plan 1.9: a teacher covering a lesson (CRM teacherId differs from originalTeacherId)
 * works with that lesson's students as with their own, from the moment CRM assigns the
 * lesson until the admin approves it. Each lesson is its own flag: the next substitution
 * opens access again. The regular teacher is never restricted by this.
 */

export type SubstitutionRef = {
  crmClassId: string;
  lessonDate: string | null;
  originalCrmTeacherId: string;
};

type CrmStudentRoster = Awaited<ReturnType<typeof fetchTeacherStudents>>;
type CrmGroupRoster = Awaited<ReturnType<typeof fetchTeacherGroups>>;
export type AccessRosterStudent = CrmStudentRoster["students"][number] & { substitution?: SubstitutionRef };
export type AccessRosterGroup = CrmGroupRoster["groups"][number] & { substitution?: SubstitutionRef };

type Lesson = Record<string, unknown>;
type ParsedSubstitution = {
  crmClassId: string;
  originalCrmTeacherId: string;
  crmStudentId: string | null;
  crmGroupId: string | null;
  lessonDate: Date | null;
  lessonStatus: string;
};

const CLOSE_REASON_BY_STATUS: Record<string, string> = { completed: "approved", cancelled: "cancelled" };
const REFRESH_INTERVAL_MS = 2 * 60_000;
const FORCED_REFRESH_FLOOR_MS = 15_000;
const lastRefreshAt = new Map<string, number>();

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lessonId(lesson: Lesson) {
  return text(lesson.crmClassId);
}

export function substitutionFromLesson(lesson: Lesson): ParsedSubstitution | null {
  if (lesson.substitution !== true) return null;
  const crmClassId = lessonId(lesson);
  const originalCrmTeacherId = text(lesson.originalCrmTeacherId);
  if (!crmClassId || !originalCrmTeacherId || lesson.classType === "trial") return null;
  const group = lesson.group as { crmGroupId?: unknown } | null | undefined;
  const crmGroupId = text(group?.crmGroupId);
  const crmStudentId = crmGroupId ? null : text(lesson.crmIndividualStudentId);
  if (!crmGroupId && !crmStudentId) return null;
  const date = typeof lesson.date === "string" || lesson.date instanceof Date ? new Date(lesson.date) : null;
  return {
    crmClassId,
    originalCrmTeacherId,
    crmStudentId,
    crmGroupId,
    lessonDate: date && !Number.isNaN(date.getTime()) ? date : null,
    lessonStatus: text(lesson.status) ?? "scheduled",
  };
}

/**
 * Brings the teacher's flags in line with lessons CRM just returned. Lessons in the list
 * that are no longer substitutions close their flag; with a range, so do open flags whose
 * lesson fell inside the range but was not returned (handed back or cancelled in CRM).
 */
export async function syncTeacherSubstitutions(
  crmTeacherId: string,
  lessons: Lesson[],
  range?: { from: string; to: string },
  now = new Date(),
) {
  const parsed = lessons.flatMap((lesson) => {
    const item = substitutionFromLesson(lesson);
    return item ? [item] : [];
  });
  const listedIds = lessons.flatMap((lesson) => lessonId(lesson) ?? []);
  const existing = await prisma.teacherSubstitution.findMany({
    where: {
      crmTeacherId,
      OR: [
        { crmClassId: { in: listedIds } },
        ...(range ? [{ closedAt: null, lessonDate: { gte: new Date(range.from), lte: new Date(range.to) } }] : []),
      ],
    },
  });
  const byClass = new Map(existing.map((row) => [row.crmClassId, row]));
  const substituted = new Set(parsed.map((item) => item.crmClassId));

  for (const item of parsed) {
    const closeReason = CLOSE_REASON_BY_STATUS[item.lessonStatus] ?? null;
    const current = byClass.get(item.crmClassId);
    const data = {
      originalCrmTeacherId: item.originalCrmTeacherId,
      crmStudentId: item.crmStudentId,
      crmGroupId: item.crmGroupId,
      lessonDate: item.lessonDate,
      lessonStatus: item.lessonStatus,
    };
    if (!current) {
      await prisma.teacherSubstitution.upsert({
        where: { crmTeacherId_crmClassId: { crmTeacherId, crmClassId: item.crmClassId } },
        create: { crmTeacherId, crmClassId: item.crmClassId, ...data, closedAt: closeReason ? now : null, closeReason },
        update: data,
      });
      continue;
    }
    await prisma.teacherSubstitution.update({
      where: { id: current.id },
      data: closeReason
        ? { ...data, closedAt: current.closedAt ?? now, closeReason: current.closeReason ?? closeReason }
        : { ...data, closedAt: null, closeReason: null },
    });
  }

  const stale = existing.filter((row) => !row.closedAt && !substituted.has(row.crmClassId));
  if (stale.length) {
    await prisma.teacherSubstitution.updateMany({
      where: { id: { in: stale.map((row) => row.id) }, closedAt: null },
      data: { closedAt: now, closeReason: "reassigned" },
    });
  }
  lastRefreshAt.set(crmTeacherId, now.getTime());
}

function defaultRange(now: Date) {
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const to = new Date(now.getTime() + 60 * 24 * 60 * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Re-reads the teacher's lessons from CRM at most every couple of minutes; CRM errors keep the stored flags. */
export async function refreshTeacherSubstitutions(crmTeacherId: string, options: { force?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const last = lastRefreshAt.get(crmTeacherId) ?? 0;
  const wait = options.force ? FORCED_REFRESH_FLOOR_MS : REFRESH_INTERVAL_MS;
  if (now.getTime() - last < wait) return false;
  lastRefreshAt.set(crmTeacherId, now.getTime());
  const range = defaultRange(now);
  try {
    const agenda = await fetchTeacherOfflineClasses(crmTeacherId, range);
    await syncTeacherSubstitutions(crmTeacherId, Array.isArray(agenda.classes) ? agenda.classes : [], range, now);
    return true;
  } catch {
    return false;
  }
}

export function resetTeacherSubstitutionRefresh() {
  lastRefreshAt.clear();
}

export async function closeLessonSubstitutions(crmClassId: string, reason: "approved" | "cancelled", now = new Date()) {
  const open = await prisma.teacherSubstitution.findMany({
    where: { crmClassId, closedAt: null },
    select: { crmTeacherId: true },
  });
  if (!open.length) return 0;
  const result = await prisma.teacherSubstitution.updateMany({
    where: { crmClassId, closedAt: null },
    data: { closedAt: now, closeReason: reason, ...(reason === "approved" ? { lessonStatus: "completed" } : { lessonStatus: "cancelled" }) },
  });
  void closeSubstituteDialogs(open.map((row) => row.crmTeacherId));
  return result.count;
}

/** Re-projects the substitutes' dialogs so the ones opened for this lesson are archived right away. */
async function closeSubstituteDialogs(crmTeacherIds: string[]) {
  const teachers = await prisma.user.findMany({
    where: { crmTeacherId: { in: [...new Set(crmTeacherIds)] }, deletedAt: null },
    select: { id: true },
  }).catch(() => []);
  if (!teachers.length) return;
  const { syncTeacherLearningDialogsFromCrm } = await import("./learning-dialog-membership.service.js");
  await Promise.allSettled(teachers.map((teacher) => syncTeacherLearningDialogsFromCrm(teacher.id)));
}

/** A lesson returned or reopened after approval is the substitute's work again. */
export async function reopenLessonSubstitutions(crmClassId: string) {
  const result = await prisma.teacherSubstitution.updateMany({
    where: { crmClassId, closedAt: { not: null }, closeReason: "approved" },
    data: { closedAt: null, closeReason: null, lessonStatus: "pending_admin_review" },
  });
  return result.count;
}

export async function activeTeacherSubstitutions(crmTeacherId: string) {
  return prisma.teacherSubstitution.findMany({
    where: { crmTeacherId, closedAt: null },
    orderBy: [{ lessonDate: "asc" }, { createdAt: "asc" }],
  });
}

function ref(row: { crmClassId: string; lessonDate: Date | null; originalCrmTeacherId: string }): SubstitutionRef {
  return {
    crmClassId: row.crmClassId,
    lessonDate: row.lessonDate ? row.lessonDate.toISOString() : null,
    originalCrmTeacherId: row.originalCrmTeacherId,
  };
}

async function originalRosters(rows: Array<{ originalCrmTeacherId: string; crmGroupId: string | null }>) {
  const teacherIds = [...new Set(rows.map((row) => row.originalCrmTeacherId))];
  const entries = await Promise.all(teacherIds.map(async (crmTeacherId) => {
    const needGroups = rows.some((row) => row.originalCrmTeacherId === crmTeacherId && row.crmGroupId);
    const [students, groups] = await Promise.all([
      fetchTeacherStudents(crmTeacherId).catch(() => null),
      needGroups ? fetchTeacherGroups(crmTeacherId).catch(() => null) : Promise.resolve(null),
    ]);
    return [crmTeacherId, { students: students?.students ?? [], groups: groups?.groups ?? [] }] as const;
  }));
  return new Map(entries);
}

function placeholderStudent(member: { crmStudentId: string; name: string; avatarUrl: string | null }, direction: string | null): AccessRosterStudent {
  const [lastName = "", firstName = ""] = member.name.split(/\s+/);
  return {
    crmStudentId: member.crmStudentId,
    name: member.name,
    firstName,
    lastName,
    phone: "",
    avatarUrl: member.avatarUrl,
    accountBalance: 0,
    directions: direction ? [direction] : [],
    assignedDirectly: false,
    groups: [],
    schedules: [],
    attendanceHistory: [],
    memberships: [],
  };
}

async function substitutionRoster(crmTeacherId: string) {
  const rows = await activeTeacherSubstitutions(crmTeacherId);
  if (!rows.length) return { students: [] as AccessRosterStudent[], groups: [] as AccessRosterGroup[] };
  const rosters = await originalRosters(rows);
  const students = new Map<string, AccessRosterStudent>();
  const groups = new Map<string, AccessRosterGroup>();
  for (const row of rows) {
    const original = rosters.get(row.originalCrmTeacherId) ?? { students: [], groups: [] };
    if (row.crmStudentId) {
      const found = original.students.find((item) => item.crmStudentId === row.crmStudentId);
      if (found && !students.has(found.crmStudentId)) students.set(found.crmStudentId, { ...found, substitution: ref(row) });
      continue;
    }
    const group = original.groups.find((item) => item.crmGroupId === row.crmGroupId);
    if (!group) continue;
    if (!groups.has(group.crmGroupId)) groups.set(group.crmGroupId, { ...group, substitution: ref(row) });
    for (const member of group.students) {
      if (students.has(member.crmStudentId)) continue;
      const found = original.students.find((item) => item.crmStudentId === member.crmStudentId);
      students.set(member.crmStudentId, { ...(found ?? placeholderStudent(member, group.direction)), substitution: ref(row) });
    }
  }
  return { students: [...students.values()], groups: [...groups.values()] };
}

/**
 * The teacher's CRM students plus the students of lessons they cover right now.
 * `need` names a student the caller is about to check: when they are missing, the flags are
 * re-read from CRM once so a just-assigned substitute is not turned away.
 */
export async function fetchTeacherStudentsForAccess(crmTeacherId: string, options: { need?: string } = {}) {
  const [own] = await Promise.all([fetchTeacherStudents(crmTeacherId), refreshTeacherSubstitutions(crmTeacherId)]);
  const merge = async () => {
    const extra = await substitutionRoster(crmTeacherId);
    const ownIds = new Set(own.students.map((item) => item.crmStudentId));
    return {
      ...own,
      students: [...own.students as AccessRosterStudent[], ...extra.students.filter((item) => !ownIds.has(item.crmStudentId))],
    };
  };
  const merged = await merge();
  if (options.need && !merged.students.some((item) => item.crmStudentId === options.need)
    && await refreshTeacherSubstitutions(crmTeacherId, { force: true })) {
    return merge();
  }
  return merged;
}

/** The teacher's CRM groups plus the groups of lessons they cover right now. */
export async function fetchTeacherGroupsForAccess(crmTeacherId: string, options: { need?: string } = {}) {
  const [own] = await Promise.all([fetchTeacherGroups(crmTeacherId), refreshTeacherSubstitutions(crmTeacherId)]);
  const merge = async () => {
    const extra = await substitutionRoster(crmTeacherId);
    const ownIds = new Set(own.groups.map((item) => item.crmGroupId));
    return {
      ...own,
      groups: [...own.groups as AccessRosterGroup[], ...extra.groups.filter((item) => !ownIds.has(item.crmGroupId))],
    };
  };
  const merged = await merge();
  if (options.need && !merged.groups.some((item) => item.crmGroupId === options.need)
    && await refreshTeacherSubstitutions(crmTeacherId, { force: true })) {
    return merge();
  }
  return merged;
}

/** Students and groups together, re-reading the flags once when `needStudent` is in neither. */
export async function fetchTeacherRosterForAccess(crmTeacherId: string, options: { needStudent?: string } = {}) {
  const read = () => Promise.all([fetchTeacherStudentsForAccess(crmTeacherId), fetchTeacherGroupsForAccess(crmTeacherId)]);
  let [students, groups] = await read();
  const has = () => students.students.some((item) => item.crmStudentId === options.needStudent)
    || groups.groups.some((group) => group.students.some((item) => item.crmStudentId === options.needStudent));
  if (options.needStudent && !has() && await refreshTeacherSubstitutions(crmTeacherId, { force: true })) {
    [students, groups] = await read();
  }
  return { students, groups };
}
