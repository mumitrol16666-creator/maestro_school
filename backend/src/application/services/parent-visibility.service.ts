import { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  changeAdminJournalStatus,
  curatorWorkspaceV2Enabled,
  upsertAdminJournalEntry,
} from "./admin-journal.service.js";

export type ParentVisibilityValues = {
  showSchedule: boolean;
  showBalance: boolean;
  showPlanProgress: boolean;
  showAchievements: boolean;
};

export const DEFAULT_PARENT_VISIBILITY: ParentVisibilityValues = {
  showSchedule: true,
  showBalance: true,
  showPlanProgress: true,
  showAchievements: true,
};

const requestSelect = {
  id: true,
  requestedShowSchedule: true,
  requestedShowBalance: true,
  requestedShowPlanProgress: true,
  requestedShowAchievements: true,
  note: true,
  status: true,
  decisionNote: true,
  createdAt: true,
  decidedAt: true,
} as const;

function policyValues(policy: ParentVisibilityValues | null | undefined): ParentVisibilityValues {
  return policy ? {
    showSchedule: policy.showSchedule,
    showBalance: policy.showBalance,
    showPlanProgress: policy.showPlanProgress,
    showAchievements: policy.showAchievements,
  } : { ...DEFAULT_PARENT_VISIBILITY };
}

function requestView(request: {
  id: string;
  requestedShowSchedule: boolean;
  requestedShowBalance: boolean;
  requestedShowPlanProgress: boolean;
  requestedShowAchievements: boolean;
  note: string | null;
  status: string;
  decisionNote: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}) {
  return {
    id: request.id,
    requested: {
      showSchedule: request.requestedShowSchedule,
      showBalance: request.requestedShowBalance,
      showPlanProgress: request.requestedShowPlanProgress,
      showAchievements: request.requestedShowAchievements,
    },
    note: request.note,
    status: request.status,
    decisionNote: request.decisionNote,
    createdAt: request.createdAt,
    decidedAt: request.decidedAt,
  };
}

async function assertStudent(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, ...notDeleted },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Student");
}

export async function getParentVisibility(studentId: string) {
  const policy = await prisma.parentVisibilityPolicy.findUnique({
    where: { studentId },
  });
  return policyValues(policy);
}

export async function getParentVisibilityWorkspace(studentId: string) {
  await assertStudent(studentId);
  const [policy, requests] = await Promise.all([
    prisma.parentVisibilityPolicy.findUnique({ where: { studentId } }),
    prisma.parentVisibilityRequest.findMany({
      where: { studentId },
      select: requestSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
  ]);
  return {
    policy: policyValues(policy),
    pendingRequest: requests.find((request) => request.status === "pending")
      ? requestView(requests.find((request) => request.status === "pending")!)
      : null,
    recentRequests: requests.map(requestView),
  };
}

export async function submitParentVisibilityRequest(params: {
  studentId: string;
  requested: ParentVisibilityValues;
  note?: string | null;
}) {
  if (!curatorWorkspaceV2Enabled()) throw new NotFoundError("Parent visibility requests");
  await assertStudent(params.studentId);
  const current = await getParentVisibility(params.studentId);
  if (Object.keys(DEFAULT_PARENT_VISIBILITY).every((key) => (
    current[key as keyof ParentVisibilityValues] === params.requested[key as keyof ParentVisibilityValues]
  ))) {
    throw new BadRequestError("Выбранные настройки уже действуют", "PARENT_VISIBILITY_UNCHANGED");
  }
  const pending = await prisma.parentVisibilityRequest.findFirst({
    where: { studentId: params.studentId, status: "pending" },
    select: { id: true },
  });
  if (pending) {
    throw new ConflictError("Предыдущий запрос уже ожидает решения администратора", "PARENT_VISIBILITY_REQUEST_PENDING");
  }

  try {
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.parentVisibilityRequest.create({
        data: {
          studentId: params.studentId,
          requestedShowSchedule: params.requested.showSchedule,
          requestedShowBalance: params.requested.showBalance,
          requestedShowPlanProgress: params.requested.showPlanProgress,
          requestedShowAchievements: params.requested.showAchievements,
          note: params.note?.trim() || null,
        },
        select: requestSelect,
      });
      await upsertAdminJournalEntry({
        sourceKey: `parent-visibility-request:${created.id}`,
        type: "parent_access",
        severity: "normal",
        source: "application",
        linkedEntityType: "parent_visibility_request",
        linkedEntityId: created.id,
        title: "Ученик просит изменить доступ родителей",
        summary: params.note?.trim() || "Проверьте выбранные учеником разделы родительского кабинета.",
        initialStatus: "new",
        actorId: params.studentId,
        payload: { studentId: params.studentId, requested: params.requested },
      }, tx);
      return created;
    });
    return requestView(request);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Предыдущий запрос уже ожидает решения администратора", "PARENT_VISIBILITY_REQUEST_PENDING");
    }
    throw error;
  }
}

export async function updateParentVisibility(params: {
  studentId: string;
  actorId: string;
  visibility: ParentVisibilityValues;
  reason: string;
}) {
  if (!curatorWorkspaceV2Enabled()) throw new NotFoundError("Parent visibility settings");
  await assertStudent(params.studentId);
  const policy = await prisma.parentVisibilityPolicy.upsert({
    where: { studentId: params.studentId },
    create: { studentId: params.studentId, updatedById: params.actorId, ...params.visibility },
    update: { updatedById: params.actorId, ...params.visibility },
  });
  await upsertAdminJournalEntry({
    sourceKey: `parent-visibility-policy:${params.studentId}:${policy.updatedAt.toISOString()}`,
    type: "parent_access",
    severity: "normal",
    source: "application",
    linkedEntityType: "parent_visibility_policy",
    linkedEntityId: policy.id,
    title: "Настройки родительского кабинета изменены",
    summary: params.reason.trim(),
    actorId: params.actorId,
    initialStatus: "resolved",
    resolution: params.reason.trim(),
    payload: { studentId: params.studentId, visibility: params.visibility },
  });
  return policyValues(policy);
}

export async function decideParentVisibilityRequest(params: {
  studentId: string;
  requestId: string;
  actorId: string;
  decision: "approved" | "rejected";
  note: string;
}) {
  if (!curatorWorkspaceV2Enabled()) throw new NotFoundError("Parent visibility requests");
  await assertStudent(params.studentId);
  const request = await prisma.parentVisibilityRequest.findFirst({
    where: { id: params.requestId, studentId: params.studentId },
    select: { ...requestSelect, studentId: true },
  });
  if (!request) throw new NotFoundError("Parent visibility request");
  if (request.status !== "pending") {
    throw new ConflictError("Этот запрос уже обработан", "PARENT_VISIBILITY_REQUEST_DECIDED");
  }

  const requested = {
    showSchedule: request.requestedShowSchedule,
    showBalance: request.requestedShowBalance,
    showPlanProgress: request.requestedShowPlanProgress,
    showAchievements: request.requestedShowAchievements,
  };
  await prisma.$transaction(async (tx) => {
    if (params.decision === "approved") {
      await tx.parentVisibilityPolicy.upsert({
        where: { studentId: params.studentId },
        create: { studentId: params.studentId, updatedById: params.actorId, ...requested },
        update: { updatedById: params.actorId, ...requested },
      });
    }
    await tx.parentVisibilityRequest.update({
      where: { id: request.id },
      data: {
        status: params.decision,
        decidedById: params.actorId,
        decisionNote: params.note.trim(),
        decidedAt: new Date(),
      },
    });
  });

  const entry = await prisma.adminJournalEntry.findUnique({
    where: { sourceKey: `parent-visibility-request:${request.id}` },
    select: { id: true, status: true },
  });
  if (entry && !["resolved", "dismissed"].includes(entry.status)) {
    await changeAdminJournalStatus({
      entryId: entry.id,
      status: params.decision === "approved" ? "resolved" : "dismissed",
      actorId: params.actorId,
      resolution: params.note.trim(),
      idempotencyKey: `parent-visibility-request:${request.id}:${params.decision}`,
      payload: { studentId: params.studentId, decision: params.decision },
    });
  }
  return getParentVisibilityWorkspace(params.studentId);
}
