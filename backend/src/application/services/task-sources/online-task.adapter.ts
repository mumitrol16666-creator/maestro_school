import type { OnlineLessonAssignmentSubmissionStatus } from "@prisma/client";
import {
  descriptionPreview,
  taskActionLabel,
  withTaskState,
  type UnifiedTask,
  type UnifiedTaskStatus,
} from "../../../domain/unified-task.js";
import { prisma } from "../../../infrastructure/database/prisma.js";

type OnlineTaskRow = {
  assignmentId: string;
  requestId: string;
  title: string;
  description: string;
  directionTitle: string;
  teacherName: string | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  pointsReward: number;
  submission: {
    status: OnlineLessonAssignmentSubmissionStatus;
    reviewComment: string | null;
    reviewPoints: number | null;
    reviewCoins: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function onlineStatus(status?: OnlineLessonAssignmentSubmissionStatus): UnifiedTaskStatus {
  if (!status) return "todo";
  if (status === "submitted") return "waiting_review";
  if (status === "returned") return "needs_revision";
  return "completed";
}

export function mapOnlineTask(row: OnlineTaskRow, now = new Date()): UnifiedTask {
  const status = onlineStatus(row.submission?.status);
  return withTaskState({
    id: `online:${row.assignmentId}`,
    source: "online",
    kind: "assignment",
    title: row.title,
    descriptionPreview: descriptionPreview(row.description),
    status,
    context: {
      primary: row.directionTitle,
      secondary: "Онлайн-урок",
      teacherName: row.teacherName,
    },
    timing: {
      assignedAt: row.createdAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      dueKind: row.dueAt ? "exact" : null,
      overdue: false,
    },
    result: {
      completionPercent: status === "completed" ? 100 : null,
      scorePercent: null,
      reviewComment: row.submission?.reviewComment ?? null,
      points: row.submission?.reviewPoints ?? (status === "completed" ? row.pointsReward : null),
      coins: row.submission?.reviewCoins ?? null,
    },
    target: {
      href: `/online-lessons/${row.requestId}${status === "needs_revision" ? "#assignment-revision" : ""}`,
      actionLabel: taskActionLabel(status, "online"),
    },
    updatedAt: (row.submission?.updatedAt ?? row.updatedAt).toISOString(),
  }, now);
}

export async function loadOnlineTasks(studentId: string, now = new Date()) {
  const assignments = await prisma.onlineLessonAssignment.findMany({
    where: {
      request: { studentId, status: "completed" },
    },
    select: {
      id: true,
      requestId: true,
      title: true,
      description: true,
      dueAt: true,
      pointsReward: true,
      createdAt: true,
      updatedAt: true,
      request: {
        select: {
          directionTitle: true,
          teacher: { select: { firstName: true, lastName: true, middleName: true } },
        },
      },
      submissions: {
        where: { studentId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          status: true,
          reviewComment: true,
          reviewPoints: true,
          reviewCoins: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return assignments.map((assignment) => mapOnlineTask({
    assignmentId: assignment.id,
    requestId: assignment.requestId,
    title: assignment.title,
    description: assignment.description,
    directionTitle: assignment.request.directionTitle,
    teacherName: assignment.request.teacher
      ? [assignment.request.teacher.firstName, assignment.request.teacher.lastName, assignment.request.teacher.middleName]
          .filter(Boolean).join(" ")
      : null,
    dueAt: assignment.dueAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    pointsReward: assignment.pointsReward,
    submission: assignment.submissions[0] ?? null,
  }, now));
}
