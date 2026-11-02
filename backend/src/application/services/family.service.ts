import bcrypt from "bcryptjs";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../domain/errors.js";
import { calculateAggregateMonthlyPlanProgress } from "../../domain/monthly-plan.js";
import { formatFio } from "../../domain/name.js";
import { resolveAudience, type CourseAudience } from "../../domain/course-access.js";
import { buildFamilyOfflineSummary } from "../../domain/family-view.js";
import { buildFamilyWeekDigest, type DigestTopicMove } from "../../domain/family-digest.js";
import { LearningTopicProgressSource } from "@prisma/client";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { getFamilyChildResults } from "./family-results.service.js";
import { syncParentDialogsForStudent } from "./learning-dialog-membership.service.js";
import { postParentLinkRevoked } from "../../infrastructure/crm/crm-client.js";
import { getPublishedMonthlyPlansForStudent } from "./student-home.service.js";
import { getParentVisibility } from "./parent-visibility.service.js";
import {
  curatorWorkspaceV2Enabled,
  upsertAdminJournalEntry,
} from "./admin-journal.service.js";

export type FamilyRelationship = "mother" | "father" | "guardian" | "other";

const parentSelect = {
  id: true,
  login: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  isActive: true,
  role: { select: { slug: true } },
} as const;

function parentLinkView(link: {
  id: string;
  relationship: string;
  isActive: boolean;
  parent: {
    id: string;
    login: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
    phone: string;
    isActive: boolean;
    role: { slug: string };
  };
}) {
  return {
    linkId: link.id,
    relationship: link.relationship,
    isActive: link.isActive,
    parent: {
      id: link.parent.id,
      login: link.parent.login,
      firstName: link.parent.firstName,
      lastName: link.parent.lastName,
      middleName: link.parent.middleName,
      fullName: formatFio(link.parent),
      phone: link.parent.phone,
      isActive: link.parent.isActive,
      role: link.parent.role.slug,
    },
  };
}

async function assertStudent(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, ...notDeleted },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Student");
  return student;
}

export async function listStudentParents(studentId: string) {
  await assertStudent(studentId);
  const links = await prisma.parentStudentLink.findMany({
    where: { studentUserId: studentId, isActive: true },
    include: { parent: { select: parentSelect } },
    orderBy: { createdAt: "asc" },
  });
  return links.map(parentLinkView);
}

export async function createParentForStudent(params: {
  studentId: string;
  actorId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  login: string;
  password: string;
  relationship: FamilyRelationship;
}) {
  await assertStudent(params.studentId);
  if (!isValidPhone(params.phone)) {
    throw new BadRequestError("Укажите корректный номер телефона родителя");
  }
  const login = normalizeLogin(params.login);
  if (!isValidLogin(login)) {
    throw new BadRequestError("Логин: 3–32 символа, латиница, цифры и _");
  }

  const [existingLogin, parentRole] = await Promise.all([
    prisma.user.findFirst({ where: { login } }),
    prisma.role.findUnique({ where: { slug: "parent" } }),
  ]);
  if (existingLogin) {
    throw new ConflictError(
      "Этот логин уже занят. Для существующего родителя используйте привязку по логину.",
      "LOGIN_ALREADY_EXISTS",
    );
  }
  if (!parentRole) {
    throw new BadRequestError("Роль родителя ещё не настроена");
  }

  const passwordHash = await bcrypt.hash(params.password, 10);
  const phone = normalizePhoneDigits(params.phone);
  const link = await prisma.$transaction(async (tx) => {
    const parent = await tx.user.create({
      data: {
        login,
        email: null,
        phone,
        phoneNormalized: phone,
        passwordHash,
        firstName: params.firstName.trim(),
        lastName: params.lastName.trim(),
        middleName: params.middleName?.trim() || null,
        roleId: parentRole.id,
        leagueEligible: false,
      },
      select: parentSelect,
    });
    const createdLink = await tx.parentStudentLink.create({
      data: {
        parentUserId: parent.id,
        studentUserId: params.studentId,
        relationship: params.relationship,
        createdById: params.actorId,
      },
      include: { parent: { select: parentSelect } },
    });
    if (curatorWorkspaceV2Enabled()) {
      await upsertAdminJournalEntry({
        sourceKey: `parent-access:${createdLink.id}:granted`,
        type: "parent_access",
        severity: "normal",
        source: "application",
        linkedEntityType: "parent_student_link",
        linkedEntityId: createdLink.id,
        title: "Родительский доступ выдан",
        summary: "Новый родительский профиль создан и получил доступ к данным ученика.",
        actorId: params.actorId,
        initialStatus: "resolved",
        resolution: "Доступ выдан администратором",
        payload: { operation: "created_and_linked", studentId: params.studentId },
      }, tx);
    }
    return createdLink;
  });

  // Plan 3.4: the parent's dialog with the child's teachers exists from the moment of linking.
  await syncParentDialogsForStudent(params.studentId).catch(() => undefined);
  return parentLinkView(link);
}

export async function linkExistingParentToStudent(params: {
  studentId: string;
  actorId: string;
  login: string;
  relationship: FamilyRelationship;
}) {
  await assertStudent(params.studentId);
  const login = normalizeLogin(params.login);
  const parent = await prisma.user.findFirst({
    where: {
      login,
      role: { slug: "parent" },
      ...notDeleted,
      isActive: true,
    },
    select: { id: true },
  });
  if (!parent) {
    throw new NotFoundError("Родитель с таким логином не найден");
  }

  const link = await prisma.$transaction(async (tx) => {
    const updatedLink = await tx.parentStudentLink.upsert({
      where: {
        parentUserId_studentUserId: {
          parentUserId: parent.id,
          studentUserId: params.studentId,
        },
      },
      create: {
        parentUserId: parent.id,
        studentUserId: params.studentId,
        relationship: params.relationship,
        createdById: params.actorId,
      },
      update: {
        relationship: params.relationship,
        isActive: true,
        revokedAt: null,
        createdById: params.actorId,
      },
      include: { parent: { select: parentSelect } },
    });
    if (curatorWorkspaceV2Enabled()) {
      await upsertAdminJournalEntry({
        sourceKey: `parent-access:${updatedLink.id}:granted`,
        type: "parent_access",
        severity: "normal",
        source: "application",
        linkedEntityType: "parent_student_link",
        linkedEntityId: updatedLink.id,
        title: "Родительский доступ выдан",
        summary: "Существующий родительский профиль получил доступ к данным ученика.",
        actorId: params.actorId,
        initialStatus: "resolved",
        resolution: "Доступ выдан администратором",
        payload: { operation: "linked", studentId: params.studentId },
      }, tx);
    }
    return updatedLink;
  });

  // Plan 3.4: the parent's dialog with the child's teachers exists from the moment of linking.
  await syncParentDialogsForStudent(params.studentId).catch(() => undefined);
  return parentLinkView(link);
}

export async function revokeParentLink(params: {
  studentId: string;
  linkId: string;
  actorId: string;
}) {
  await assertStudent(params.studentId);
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      id: params.linkId,
      studentUserId: params.studentId,
      isActive: true,
    },
    select: { id: true, parentUserId: true, student: { select: { crmStudentId: true } } },
  });
  if (!link) throw new NotFoundError("Parent link");

  await prisma.$transaction(async (tx) => {
    await tx.parentStudentLink.update({
      where: { id: link.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    if (curatorWorkspaceV2Enabled()) {
      await upsertAdminJournalEntry({
        sourceKey: `parent-access:${link.id}:revoked`,
        type: "parent_access",
        severity: "normal",
        source: "application",
        linkedEntityType: "parent_student_link",
        linkedEntityId: link.id,
        title: "Родительский доступ отозван",
        summary: "Доступ родительского профиля к данным ученика отключён.",
        actorId: params.actorId,
        initialStatus: "resolved",
        resolution: "Доступ отозван администратором",
        payload: { operation: "revoked", studentId: params.studentId },
      }, tx);
    }
  });
  // The parent leaves the teachers' dialogs; CRM learns the access is gone (plan 3.6).
  await syncParentDialogsForStudent(params.studentId).catch(() => undefined);
  let crmNotified = false;
  if (link.student.crmStudentId) {
    crmNotified = await postParentLinkRevoked({ crmStudentId: link.student.crmStudentId, parentUserId: link.parentUserId })
      .then(() => true)
      .catch(() => false);
  }
  return { revoked: true, crmNotified };
}

export async function resetLinkedParentPassword(params: {
  studentId: string;
  linkId: string;
  password: string;
}) {
  await assertStudent(params.studentId);
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      id: params.linkId,
      studentUserId: params.studentId,
      isActive: true,
      parent: {
        role: { slug: "parent" },
        ...notDeleted,
        isActive: true,
      },
    },
    select: { parentUserId: true },
  });
  if (!link) throw new NotFoundError("Parent link");

  await prisma.user.update({
    where: { id: link.parentUserId },
    data: { passwordHash: await bcrypt.hash(params.password, 10) },
  });
  return { updated: true };
}

/**
 * Stage 4: `audience` says what the family page shows for the child. `school` is a student with a CRM
 * link (school overview and courses); `external` is a student who registered in the app and has no CRM
 * link — there is no school data for them, only online courses.
 */
export function childAudience(student: { crmStudentId: string | null }): CourseAudience {
  return resolveAudience({ roleSlug: "student", crmStudentId: student.crmStudentId });
}

export async function listParentChildren(parentUserId: string) {
  const links = await prisma.parentStudentLink.findMany({
    where: {
      parentUserId,
      isActive: true,
      student: {
        role: { slug: "student" },
        ...notDeleted,
        isActive: true,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
          crmStudentId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return links.map((link) => ({
    id: link.student.id,
    firstName: link.student.firstName,
    lastName: link.student.lastName,
    middleName: link.student.middleName,
    fullName: formatFio(link.student),
    avatar: link.student.avatar,
    relationship: link.relationship,
    audience: childAudience(link.student),
  }));
}

export async function assertParentChildLink(parentUserId: string, studentUserId: string) {
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      parentUserId,
      studentUserId,
      isActive: true,
      parent: { role: { slug: "parent" }, ...notDeleted, isActive: true },
      student: { role: { slug: "student" }, ...notDeleted, isActive: true },
    },
    include: {
      student: {
        select: {
          id: true,
          crmStudentId: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
        },
      },
    },
  });
  if (!link) throw new NotFoundError("Связь с учеником не найдена");
  return link;
}

export async function getParentChildOfflineSummary(
  parentUserId: string,
  studentUserId: string,
) {
  const link = await assertParentChildLink(parentUserId, studentUserId);
  const visibility = await getParentVisibility(studentUserId);
  const child = {
    id: link.student.id,
    firstName: link.student.firstName,
    lastName: link.student.lastName,
    middleName: link.student.middleName,
    fullName: formatFio(link.student),
    avatar: link.student.avatar,
    relationship: link.relationship,
    audience: childAudience(link.student),
  };
  if (child.audience === "external") {
    // No CRM card, so nothing to ask the school for and nothing to apologise about: the family page
    // shows only the child's online courses. The shape of the answer stays the same.
    const summary = buildFamilyOfflineSummary(
      { profile: { name: child.fullName, groups: [] }, balanceSnapshot: {}, upcomingLessons: [] },
      { ...visibility, showBalance: false, showSchedule: false },
    );
    return {
      child,
      visibility,
      summary: { ...summary, crmUnavailable: false, crmError: null, crmSnapshotAt: null, crmStale: false, results: null },
    };
  }
  const [offlineRead, results] = await Promise.all([
    getStudentSchoolOfflineSummary(studentUserId)
      .then((value) => ({ value, error: null as AppError | null }))
      .catch((error: unknown) => {
        // CRM unreachable or the child is not linked yet: the parent still gets
        // the Platform-owned blocks instead of an empty screen.
        if (error instanceof AppError && (error.statusCode >= 500 || error.code === "CRM_NOT_LINKED")) {
          return { value: null, error };
        }
        throw error;
      }),
    // Plan 3.3: «Результаты» (topics, sectors, LEVEL of the month) instead of streak milestones.
    visibility.showAchievements
      ? getFamilyChildResults(studentUserId)
      : Promise.resolve(null),
  ]);
  const summary = {
    ...(offlineRead.value
      ? buildFamilyOfflineSummary(offlineRead.value, visibility)
      : buildFamilyOfflineSummary({
          profile: { name: formatFio(link.student), groups: [] },
          balanceSnapshot: {},
          upcomingLessons: [],
        }, { ...visibility, showBalance: false, showSchedule: false })),
    crmUnavailable: !offlineRead.value,
    crmError: offlineRead.error?.code ?? null,
    crmSnapshotAt: (offlineRead.value as { crmSnapshotAt?: string } | null)?.crmSnapshotAt ?? null,
    crmStale: Boolean((offlineRead.value as { crmStale?: boolean } | null)?.crmStale),
    results,
  };
  // Plan 5.4: the week in one card and one sentence to say to the child; topics only when the
  // parent may see the sector.
  const digestVisits = (visibility.showSchedule ? summary.visits : []) as Array<{
    crmClassId: string | null; date: string | null; confirmed: boolean; attendance: string; topic: string | null; summary: string | null;
  }>;
  const confirmedIds = digestVisits.filter((visit) => visit.confirmed && visit.crmClassId).map((visit) => visit.crmClassId!);
  const topicMoves: DigestTopicMove[] = visibility.showPlanProgress && confirmedIds.length
    ? (await prisma.learningTopicProgress.findMany({
        where: {
          source: LearningTopicProgressSource.lesson,
          OR: confirmedIds.map((crmClassId) => ({ sourceKey: { startsWith: `offline-lesson:${crmClassId}:topic:` } })),
          topic: { OR: [{ crmStudentId: link.student.crmStudentId ?? "" }, { crmStudentId: null, crmGroupId: { not: null } }] },
        },
        select: { sourceKey: true, fromPercent: true, toPercent: true, topic: { select: { title: true } } },
      })).flatMap((row) => {
        const crmClassId = confirmedIds.find((id) => row.sourceKey.startsWith(`offline-lesson:${id}:topic:`));
        return crmClassId ? [{ crmClassId, title: row.topic.title, fromPercent: row.fromPercent, toPercent: row.toPercent }] : [];
      })
    : [];
  const weekDigest = buildFamilyWeekDigest({ childName: formatFio(link.student), visits: digestVisits, topicMoves });
  return {
    child,
    visibility,
    summary: { ...summary, weekDigest },
  };
}

export async function getParentChildMonthlyPlans(
  parentUserId: string,
  studentUserId: string,
  month: string,
) {
  await assertParentChildLink(parentUserId, studentUserId);
  const visibility = await getParentVisibility(studentUserId);
  if (!visibility.showPlanProgress) {
    throw new ForbiddenError("Учебный план скрыт настройками семейного доступа");
  }
  const allPlans = await getPublishedMonthlyPlansForStudent(studentUserId, month, {
    requireLinkedProfile: true,
    includeClosed: true,
  });
  const plans = allPlans.filter((plan) => (plan as { status?: string }).status !== "closed");
  // Plan 1.10: a sector closed by an exam stays visible for a month so the parent sees the result.
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentExams = allPlans.filter((plan) => {
    const exam = (plan as { exam?: { status: string; finishedAt: Date | string | null } | null }).exam;
    return (plan as { status?: string }).status === "closed"
      && exam?.status === "completed"
      && exam.finishedAt !== null
      && new Date(exam.finishedAt).getTime() >= since;
  });
  return {
    month,
    plans,
    recentExams,
    aggregateProgress: calculateAggregateMonthlyPlanProgress(plans),
  };
}
