import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchTeacherStudents, fetchTeacherGroups, fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";
import { AppError, ForbiddenError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { prepareLegacyDecision, type LegacyDecision, type LegacyDecisionEvent } from "../../domain/legacy-homework-resolution.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";
import { learningHomeworkV2Enabled, listLearningHomeworkAssignmentsByCrmStudent, requireLearningHomeworkReviewAccess } from "./learning-homework-v2.service.js";
import { mapOfflineTask } from "./task-sources/offline-task.adapter.js";

export async function requireTeacherHomeworkStudent(teacherId: string, crmStudentId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherId);
  const [direct, groups] = await Promise.all([fetchTeacherStudents(crmTeacherId), fetchTeacherGroups(crmTeacherId)]);
  const directStudent = direct.students.find(item => item.crmStudentId === crmStudentId);
  const student = directStudent
    ?? groups.groups.flatMap(group => group.students).find(item => item.crmStudentId === crmStudentId);
  if (!student) throw new ForbiddenError("Ученик не закреплён за вами и не состоит в вашей группе");
  return { crmTeacherId, student, directlyAssigned: Boolean(directStudent), groupIds: groups.groups.filter(group => group.students.some(item => item.crmStudentId === crmStudentId)).map(group => group.crmGroupId) };
}

type LegacyLesson = Parameters<typeof mapOfflineTask>[0] & { materials?: unknown[] };
export async function getTeacherStudentHomework(teacherId: string, crmStudentId: string) {
  const scope = await requireTeacherHomeworkStudent(teacherId, crmStudentId);
  const user = await prisma.user.findFirst({ where: { crmStudentId, deletedAt: null, isActive: true }, select: { id: true } });
  const [assignmentResult, summaryResult, resolutions] = await Promise.all([
    learningHomeworkV2Enabled() ? listLearningHomeworkAssignmentsByCrmStudent(crmStudentId) : Promise.resolve([]),
    (user ? getStudentSchoolOfflineSummary(user.id) : fetchStudentOfflineSummary(crmStudentId)).then(data => ({ data, ok: true as const })).catch(() => ({ data: null, ok: false as const })),
    prisma.legacyHomeworkResolution.findMany({ where: { crmStudentId } }),
  ]);
  const representedLessons = new Set(assignmentResult.map(item => item.sourceLessonId).filter(Boolean));
  const canonical = [];
  for (const assignment of assignmentResult) {
    const topic = await prisma.learningTopic.findUniqueOrThrow({ where: { id: assignment.topic.id }, include: { direction: true } });
    try { await requireLearningHomeworkReviewAccess(teacherId, topic); }
    catch (reason) {
      if (reason instanceof ForbiddenError || (reason instanceof AppError && reason.code === "CRM_DIRECTION_NOT_ASSIGNED")) continue;
      throw reason;
    }
    canonical.push({
      key: `v2:${assignment.recipientId}`, model: "learning_homework_v2" as const,
      title: assignment.topic.title, instructions: assignment.instructions, assignedAt: assignment.assignedAt,
      state: assignment.state, comment: assignment.latestAttempt?.review?.comment ?? null,
      reviewHref: assignment.latestAttempt ? `/admin/homework-review/${assignment.recipientId}` : null,
      lessonHref: assignment.sourceLessonId ? `/admin/offline-lessons/${encodeURIComponent(assignment.sourceLessonId)}` : null,
      // The existing review screen owns private materials and submission history.
      canResolve: false, revision: 0, history: [], crmClassId: assignment.sourceLessonId,
    });
  }
  const raw = summaryResult.data as { lessonHistory?: LegacyLesson[] } | null;
  const legacy = (raw?.lessonHistory ?? []).flatMap(lesson => {
    if (representedLessons.has(lesson.crmClassId)) return [];
    const resolution = resolutions.find(item => item.crmClassId === lesson.crmClassId) ?? null;
    const task = mapOfflineTask({ ...lesson, legacyResolution: resolution }, []);
    if (!task) return [];
    const state = resolution?.decision ?? (task.status === "completed" ? "accepted" : "clarify");
    return [{
      key: task.id, model: "legacy" as const, title: task.title, instructions: lesson.homework ?? "",
      assignedAt: task.timing.assignedAt, state, comment: resolution?.comment ?? task.result.reviewComment,
      reviewHref: null, lessonHref: `/admin/offline-lessons/${encodeURIComponent(lesson.crmClassId)}`,
      canResolve: lesson.crmTeacherId === scope.crmTeacherId || Boolean(lesson.crmGroupId && scope.groupIds.includes(lesson.crmGroupId)),
      revision: resolution?.revision ?? 0,
      history: ((resolution?.history ?? []) as unknown as LegacyDecisionEvent[]).map(({ decision, comment, actorName, at }) => ({ decision, comment, actorName, at })),
      crmClassId: lesson.crmClassId,
    }];
  });
  const planHref = scope.directlyAssigned
    ? `/admin/my-students/student/${encodeURIComponent(crmStudentId)}/plan`
    : scope.groupIds[0] ? `/admin/my-students/group/${encodeURIComponent(scope.groupIds[0])}/plan` : null;
  return { student: { crmStudentId, name: scope.student.name }, planHref, items: [...canonical, ...legacy], partial: !summaryResult.ok };
}

export async function resolveLegacyHomework(input: {
  teacherId: string; crmStudentId: string; crmClassId: string; decision: LegacyDecision;
  comment: string; expectedRevision: number; requestKey: string;
}) {
  const workspace = await getTeacherStudentHomework(input.teacherId, input.crmStudentId);
  if (workspace.partial) throw new ConflictError("Не удалось проверить исходное задание. Повторите позже");
  const item = workspace.items.find(item => item.model === "legacy" && item.crmClassId === input.crmClassId);
  if (!item) throw new NotFoundError("Домашнее задание");
  if (!item.canResolve) throw new ForbiddenError("Это задание другого преподавателя");
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: input.teacherId }, select: { firstName: true, lastName: true } });
  const event: LegacyDecisionEvent = {
    decision: input.decision, comment: input.comment.trim(), actorId: input.teacherId,
    actorName: [actor.lastName, actor.firstName].join(" "), at: new Date().toISOString(),
    requestKey: input.requestKey, expectedRevision: input.expectedRevision,
  };
  return prisma.$transaction(async tx => {
    // Serialize the first insert too; optimistic revision protects different requests.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.crmStudentId, input.crmClassId])}, 0))::text`;
    const where = { crmStudentId_crmClassId: { crmStudentId: input.crmStudentId, crmClassId: input.crmClassId } };
    const current = await tx.legacyHomeworkResolution.findUnique({ where });
    const next = prepareLegacyDecision(current, event);
    if (next.idempotent) return { idempotent: true, revision: next.revision };
    const data = { decision: event.decision, comment: event.comment, revision: next.revision, history: next.history as unknown as Prisma.InputJsonValue };
    const saved = await tx.legacyHomeworkResolution.upsert({
      where, create: { id: randomUUID(), crmStudentId: input.crmStudentId, crmClassId: input.crmClassId, ...data }, update: data,
    });
    await tx.auditLog.create({ data: {
      entityType: "legacy_homework_resolution", entityId: saved.id, action: "update", actorId: input.teacherId,
      payload: { decision: event.decision, revision: next.revision, crmStudentId: input.crmStudentId, crmClassId: input.crmClassId, comment: event.comment },
    } });
    // Resolving historical work never calls reward, attendance or topic-progress services.
    return { idempotent: false, revision: next.revision };
  });
}
