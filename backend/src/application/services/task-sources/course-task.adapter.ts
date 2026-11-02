import type { HomeworkSubmissionStatus, HomeworkType, LessonProgressStatus } from "@prisma/client";
import {
  descriptionPreview,
  taskActionLabel,
  withTaskState,
  type UnifiedTask,
  type UnifiedTaskStatus,
} from "../../../domain/unified-task.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import { findLockedLessonIds } from "../course-access.service.js";

type CourseTaskRow = {
  homeworkId: string;
  homeworkType: HomeworkType;
  homeworkDescription: string;
  homeworkCreatedAt: Date;
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  progress: { status: LessonProgressStatus; createdAt: Date; updatedAt: Date } | null;
  submission: {
    status: HomeworkSubmissionStatus;
    testScore: number | null;
    reviewComment: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function courseStatus(row: CourseTaskRow): UnifiedTaskStatus | null {
  if (row.submission?.status === "approved") return "completed";
  if (row.submission?.status === "rejected") return "needs_revision";
  if (row.submission && ["pending", "submitted", "under_review"].includes(row.submission.status)) {
    return "waiting_review";
  }
  if (row.progress?.status === "completed") return "completed";
  if (row.progress?.status === "in_progress") return "todo";
  return null;
}

export function mapCourseTask(row: CourseTaskRow, now = new Date()): UnifiedTask | null {
  const status = courseStatus(row);
  if (!status) return null;
  const updatedAt = row.submission?.updatedAt ?? row.progress?.updatedAt ?? row.homeworkCreatedAt;
  return withTaskState({
    id: `course:${row.homeworkId}`,
    source: "course",
    kind: row.homeworkType,
    title: row.lessonTitle,
    descriptionPreview: descriptionPreview(row.homeworkDescription),
    status,
    context: {
      primary: row.courseTitle,
      secondary: row.moduleTitle,
      teacherName: null,
    },
    timing: {
      assignedAt: (row.progress?.createdAt ?? row.homeworkCreatedAt).toISOString(),
      dueAt: null,
      dueKind: null,
      overdue: false,
    },
    result: {
      completionPercent: status === "completed" ? 100 : null,
      scorePercent: row.submission?.testScore ?? null,
      reviewComment: row.submission?.reviewComment ?? null,
      points: null,
      coins: null,
    },
    target: {
      href: `/lessons/${row.lessonId}${status === "needs_revision" ? "#homework-revision" : ""}`,
      actionLabel: taskActionLabel(status, "course", row.homeworkType),
    },
    updatedAt: updatedAt.toISOString(),
  }, now);
}

export async function loadCourseTasks(studentId: string, now = new Date()) {
  const enrollments = await prisma.studentCourse.findMany({
    where: {
      studentId,
      status: { not: "cancelled" },
      course: { isPublished: true, deletedAt: null },
    },
    select: {
      course: {
        select: {
          id: true,
          title: true,
          priceKzt: true,
          includedInSchool: true,
          freeLessonsCount: true,
          modules: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            select: {
              title: true,
              lessons: {
                where: { isPublished: true, deletedAt: null },
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  title: true,
                  lessonProgress: {
                    where: { studentId },
                    take: 1,
                    select: { status: true, createdAt: true, updatedAt: true },
                  },
                  homeworks: {
                    where: { deletedAt: null },
                    orderBy: { createdAt: "asc" },
                    take: 1,
                    select: {
                      id: true,
                      type: true,
                      description: true,
                      createdAt: true,
                      submissions: {
                        where: { studentId },
                        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
                        take: 1,
                        select: {
                          status: true,
                          testScore: true,
                          reviewComment: true,
                          createdAt: true,
                          updatedAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Stage 4: a task of a paid lesson the student cannot open any more (access ended or was refunded)
  // is not a to-do: it would lead to the paywall. Finished ones stay in the history.
  const locked = await findLockedLessonIds(studentId, enrollments.map(({ course }) => ({
    course,
    orderedLessonIds: course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
  })));

  return enrollments.flatMap(({ course }) => course.modules.flatMap((module) =>
    module.lessons.flatMap((lesson) => lesson.homeworks.flatMap((homework) => {
      const row: CourseTaskRow = {
        homeworkId: homework.id,
        homeworkType: homework.type,
        homeworkDescription: homework.description,
        homeworkCreatedAt: homework.createdAt,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        moduleTitle: module.title,
        courseTitle: course.title,
        progress: lesson.lessonProgress[0] ?? null,
        submission: homework.submissions[0] ?? null,
      };
      if (locked.has(lesson.id) && courseStatus(row) !== "completed") return [];
      const task = mapCourseTask(row, now);
      return task ? [task] : [];
    })),
  ));
}
