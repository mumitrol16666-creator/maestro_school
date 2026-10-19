import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { requireTeacherHomeworkStudent } from "./teacher-student-homework.service.js";

/**
 * Plan 1.12: a teacher sends any published course lesson to a student as material. The student
 * opens the bare lesson to watch: no start, no submission, and course progress does not move.
 */

const lessonInclude = {
  module: { select: { title: true, course: { select: { id: true, title: true } } } },
  materials: { orderBy: { sortOrder: "asc" as const } },
} as const;

async function loadPublishedLesson(lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: lessonId, isPublished: true, deletedAt: null,
      module: { deletedAt: null, course: { isPublished: true, deletedAt: null } },
    },
    include: lessonInclude,
  });
  if (!lesson) throw new NotFoundError("Урок курса");
  return lesson;
}

/** Courses and their published lessons, for the teacher's "send a lesson" picker. */
export async function listShareableCourseLessons() {
  const courses = await prisma.course.findMany({
    where: { isPublished: true, deletedAt: null },
    orderBy: [{ title: "asc" }],
    select: {
      id: true,
      title: true,
      modules: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          lessons: {
            where: { isPublished: true, deletedAt: null },
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, videoUrl: true },
          },
        },
      },
    },
  });
  return courses
    .map((course) => ({
      id: course.id,
      title: course.title,
      lessons: course.modules.flatMap((module) => module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        moduleTitle: module.title,
        hasVideo: Boolean(lesson.videoUrl),
      }))),
    }))
    .filter((course) => course.lessons.length > 0);
}

export async function shareCourseLessonWithStudent(teacherUserId: string, crmStudentId: string, input: {
  lessonId: string;
  note?: string | null;
}) {
  await requireTeacherHomeworkStudent(teacherUserId, crmStudentId);
  const student = await prisma.user.findFirst({
    where: { crmStudentId, deletedAt: null, isActive: true, role: { slug: "student" } },
    select: { id: true },
  });
  if (!student) {
    throw new BadRequestError("Ученик ещё не подключил приложение: отправить урок пока некуда", "STUDENT_APP_NOT_LINKED");
  }
  const lesson = await loadPublishedLesson(input.lessonId);
  const note = input.note?.trim().slice(0, 1000) || null;
  const existing = await prisma.lessonShare.findUnique({
    where: { lessonId_studentUserId: { lessonId: lesson.id, studentUserId: student.id } },
  });
  const share = existing
    ? await prisma.lessonShare.update({ where: { id: existing.id }, data: { note: note ?? existing.note, sharedById: teacherUserId, viewedAt: null, createdAt: new Date() } })
    : await prisma.lessonShare.create({ data: { lessonId: lesson.id, studentUserId: student.id, sharedById: teacherUserId, note } });
  try {
    const { deliverUserNotification } = await import("./notification.service.js");
    await deliverUserNotification({
      userId: student.id,
      type: "material_shared",
      title: "Преподаватель прислал урок",
      body: `${lesson.title}${note ? `. ${note.slice(0, 120)}` : ""}`,
      url: `/shared-lessons/${share.id}`,
      tag: `lesson-share-${share.id}`,
      dedupeKey: `lesson-share:${share.id}:${share.createdAt.toISOString()}`,
    });
  } catch {
    // The share is saved even if the notification cannot be delivered right now.
  }
  return { id: share.id, lessonId: lesson.id, title: lesson.title, resent: Boolean(existing) };
}

function shareDto(share: {
  id: string; note: string | null; viewedAt: Date | null; createdAt: Date;
  sharedBy: { firstName: string | null; lastName: string | null } | null;
  lesson: { id: string; title: string; module: { title: string; course: { id: string; title: string } } };
}) {
  return {
    id: share.id,
    note: share.note,
    viewedAt: share.viewedAt,
    sharedAt: share.createdAt,
    teacherName: share.sharedBy ? [share.sharedBy.lastName, share.sharedBy.firstName].filter(Boolean).join(" ") : null,
    lesson: {
      id: share.lesson.id,
      title: share.lesson.title,
      moduleTitle: share.lesson.module.title,
      courseTitle: share.lesson.module.course.title,
    },
  };
}

export async function listStudentLessonShares(studentUserId: string) {
  const shares = await prisma.lessonShare.findMany({
    where: { studentUserId, lesson: { isPublished: true, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: {
      sharedBy: { select: { firstName: true, lastName: true } },
      lesson: { select: { id: true, title: true, module: { select: { title: true, course: { select: { id: true, title: true } } } } } },
    },
  });
  return shares.map(shareDto);
}

/** The bare lesson for viewing: text, video and materials. No homework, no progress. */
export async function getStudentLessonShare(studentUserId: string, shareId: string) {
  const share = await prisma.lessonShare.findUnique({
    where: { id: shareId },
    include: {
      sharedBy: { select: { firstName: true, lastName: true } },
      lesson: { include: lessonInclude },
    },
  });
  if (!share) throw new NotFoundError("Урок");
  if (share.studentUserId !== studentUserId) throw new ForbiddenError("Этот урок отправлен другому ученику");
  if (!share.lesson.isPublished || share.lesson.deletedAt) throw new NotFoundError("Урок");
  if (!share.viewedAt) {
    await prisma.lessonShare.update({ where: { id: share.id }, data: { viewedAt: new Date() } });
  }
  return {
    ...shareDto(share),
    content: {
      description: share.lesson.description,
      videoUrl: share.lesson.videoUrl,
      materials: share.lesson.materials.map((material) => ({
        id: material.id,
        type: material.type,
        title: material.title,
        url: material.url,
      })),
    },
  };
}
