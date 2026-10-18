import type { LearningSectorProposalKind, LearningSectorProposalStatus } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { fetchTeacherStudents } from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { deliverUserNotification } from "./notification.service.js";

/**
 * Student proposals into a sector: a topic, a song or a goal written from home.
 * The teacher accepts (optionally after adding the topic to the active sector)
 * or declines with a reply. The proposal is never applied automatically.
 */

const proposalInclude = {
  direction: { select: { id: true, title: true, crmDirectionId: true } },
  plan: { select: { id: true, sequence: true, status: true } },
  student: { select: { id: true, firstName: true, lastName: true, middleName: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
} as const;

type ProposalRow = NonNullable<Awaited<ReturnType<typeof loadProposal>>>;

async function loadProposal(id: string) {
  return prisma.learningSectorProposal.findUnique({ where: { id }, include: proposalInclude });
}

export function proposalDto(row: ProposalRow) {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    link: row.link,
    status: row.status,
    teacherReply: row.teacherReply,
    acceptedTopicId: row.acceptedTopicId,
    direction: { crmDirectionId: row.direction.crmDirectionId, title: row.direction.title },
    sector: row.plan ? { id: row.plan.id, sequence: row.plan.sequence, status: row.plan.status } : null,
    student: { id: row.student.id, name: formatFio(row.student), crmStudentId: row.crmStudentId },
    decidedBy: row.decidedBy ? { id: row.decidedBy.id, name: formatFio(row.decidedBy) } : null,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  };
}

async function requireLinkedStudent(studentUserId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentUserId, ...notDeleted, isActive: true },
    select: { id: true, crmStudentId: true, firstName: true, lastName: true, middleName: true },
  });
  if (!student?.crmStudentId) {
    throw new BadRequestError("Профиль школы не подключён. Обратитесь к администратору Maestro.", "CRM_NOT_LINKED");
  }
  return { ...student, crmStudentId: student.crmStudentId };
}

export async function listStudentSectorProposals(studentUserId: string) {
  const rows = await prisma.learningSectorProposal.findMany({
    where: { studentUserId },
    include: proposalInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(proposalDto);
}

export async function createStudentSectorProposal(studentUserId: string, input: {
  crmDirectionId: string;
  kind: LearningSectorProposalKind;
  text: string;
  link?: string | null;
}) {
  const student = await requireLinkedStudent(studentUserId);
  const text = input.text.trim();
  if (!text) throw new BadRequestError("Напишите, что предлагаете", "SECTOR_PROPOSAL_TEXT_REQUIRED");
  const direction = await prisma.direction.findFirst({
    where: { crmDirectionId: input.crmDirectionId, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!direction) throw new NotFoundError("Направление не найдено");

  const openCount = await prisma.learningSectorProposal.count({
    where: { studentUserId, status: "new" },
  });
  if (openCount >= 10) {
    throw new BadRequestError("Дождитесь ответа преподавателя по уже отправленным предложениям", "SECTOR_PROPOSAL_LIMIT");
  }
  const activeSector = await prisma.learningPlan.findFirst({
    where: { crmStudentId: student.crmStudentId, crmGroupId: null, directionId: direction.id, status: "active" },
    select: { id: true, createdById: true },
  });
  const created = await prisma.learningSectorProposal.create({
    data: {
      planId: activeSector?.id ?? null,
      directionId: direction.id,
      crmStudentId: student.crmStudentId,
      studentUserId,
      kind: input.kind,
      text: text.slice(0, 2000),
      link: input.link?.trim() ? input.link.trim().slice(0, 1024) : null,
    },
    include: proposalInclude,
  });

  const teachers = await prisma.learningTopic.findMany({
    where: { crmStudentId: student.crmStudentId, directionId: direction.id, responsibleTeacherId: { not: null } },
    select: { responsibleTeacherId: true },
    distinct: ["responsibleTeacherId"],
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  const teacherIds = new Set<string>(
    [...teachers.map((row) => row.responsibleTeacherId), activeSector?.createdById]
      .filter((id): id is string => Boolean(id)),
  );
  await Promise.allSettled([...teacherIds].map((teacherId) => deliverUserNotification({
    userId: teacherId,
    type: "sector_proposal_created",
    title: `Предложение в сектор: ${formatFio(student)}`,
    body: `${direction.title}. ${text.slice(0, 160)}`,
    url: `/admin/my-students/student/${encodeURIComponent(student.crmStudentId)}/plan`,
    tag: `sector-proposal-${created.id}`,
    dedupeKey: `sector-proposal:${created.id}:${teacherId}`,
  })));
  return proposalDto(created);
}

async function teacherStudentIds(teacherUserId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const roster = await fetchTeacherStudents(crmTeacherId);
  return new Set(roster.students.map((student) => student.crmStudentId));
}

export async function listTeacherSectorProposals(teacherUserId: string, filter: {
  status?: LearningSectorProposalStatus;
  crmStudentId?: string;
} = {}) {
  const allowed = await teacherStudentIds(teacherUserId);
  if (filter.crmStudentId && !allowed.has(filter.crmStudentId)) {
    throw new ForbiddenError("Этот ученик не назначен преподавателю");
  }
  const rows = await prisma.learningSectorProposal.findMany({
    where: {
      crmStudentId: filter.crmStudentId ? filter.crmStudentId : { in: [...allowed] },
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: proposalInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map(proposalDto);
}

export async function decideSectorProposal(teacherUserId: string, proposalId: string, input: {
  decision: "accepted" | "declined";
  reply?: string | null;
  acceptedTopicId?: string | null;
}) {
  const proposal = await loadProposal(proposalId);
  if (!proposal) throw new NotFoundError("Предложение не найдено");
  const allowed = await teacherStudentIds(teacherUserId);
  if (!allowed.has(proposal.crmStudentId)) throw new ForbiddenError("Этот ученик не назначен преподавателю");
  if (proposal.status !== "new") return proposalDto(proposal);

  const reply = input.reply?.trim() || null;
  if (input.decision === "declined" && !reply) {
    throw new BadRequestError("Напишите ученику, почему предложение не принято", "SECTOR_PROPOSAL_REPLY_REQUIRED");
  }
  if (input.acceptedTopicId) {
    const topic = await prisma.learningTopic.findFirst({
      where: { id: input.acceptedTopicId, crmStudentId: proposal.crmStudentId, directionId: proposal.directionId, archivedAt: null },
      select: { id: true },
    });
    if (!topic) throw new BadRequestError("Тема не принадлежит этому ученику и направлению", "LEARNING_TOPIC_SCOPE_MISMATCH");
  }
  const updated = await prisma.learningSectorProposal.update({
    where: { id: proposal.id },
    data: {
      status: input.decision,
      teacherReply: reply,
      acceptedTopicId: input.decision === "accepted" ? input.acceptedTopicId ?? null : null,
      decidedById: teacherUserId,
      decidedAt: new Date(),
    },
    include: proposalInclude,
  });
  await deliverUserNotification({
    userId: proposal.studentUserId,
    type: "sector_proposal_decided",
    title: input.decision === "accepted" ? "Предложение принято в сектор" : "Предложение не принято",
    body: `${proposal.direction.title}: «${proposal.text.slice(0, 120)}».${reply ? ` ${reply.slice(0, 200)}` : ""}`,
    url: "/learning",
    tag: `sector-proposal-decided-${proposal.id}`,
    dedupeKey: `sector-proposal-decided:${proposal.id}`,
  }).catch(() => undefined);
  return proposalDto(updated);
}
