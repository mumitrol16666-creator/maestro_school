import type { BoardPost, Course, Lesson, LessonStatus } from "@/types";
import type {
  ApiCourseDetail,
  ApiCourseLesson,
  ApiCourseSummary,
  ApiLessonDetail,
  ApiLessonProgress,
  ApiNewsPost,
} from "@/types/api";

const courseAccents = ["#715844", "#66715A", "#465A68", "#6A566E"];

export function normalizeLessonStatus(status?: string): LessonStatus {
  const normalized = status?.toLowerCase();
  if (
    normalized === "available" ||
    normalized === "locked" ||
    normalized === "in_progress" ||
    normalized === "submitted" ||
    normalized === "reviewed" ||
    normalized === "completed"
  ) {
    return normalized;
  }
  return "locked";
}

export function difficultyLabel(level: string) {
  return {
    beginner: "Начальный",
    intermediate: "Средний",
    advanced: "Продвинутый",
    all_levels: "Для всех",
  }[level] ?? level;
}

export function toCourse(
  course: ApiCourseSummary,
  index: number,
): Course {
  return {
    id: course.id,
    directionId: course.directionId,
    title: course.title,
    description: course.description ?? "",
    level: difficultyLabel(course.difficultyLevel),
    access: course.enrollmentStatus ? "enrolled" : "available",
    progress: course.progress ?? 0,
    accent: courseAccents[index % courseAccents.length],
    modulesCount: course.modulesCount,
    lessonsCount: course.lessonsCount,
  };
}

export function toCourseLesson(
  lesson: ApiCourseLesson,
  moduleId: string,
  courseId: string,
  progress?: ApiLessonProgress,
): Lesson {
  return {
    id: lesson.id,
    courseId,
    moduleId,
    title: lesson.title,
    description: lesson.description ?? "",
    order: lesson.sortOrder,
    status: normalizeLessonStatus(progress?.status),
    pointsReward: lesson.pointsReward,
    materials: [],
  };
}

export function flattenCourseLessons(course: ApiCourseDetail, progress: ApiLessonProgress[]) {
  const progressMap = new Map(progress.map((item) => [item.lessonId, item]));
  return course.modules.flatMap((module) =>
    module.lessons.map((lesson) => toCourseLesson(lesson, module.id, course.id, progressMap.get(lesson.id))),
  );
}

export function toLesson(detail: ApiLessonDetail, status?: string): Lesson {
  return {
    id: detail.id,
    courseId: detail.courseId,
    moduleId: detail.moduleId,
    title: detail.title,
    description: detail.description ?? "",
    order: detail.sortOrder,
    status: normalizeLessonStatus(status),
    pointsReward: detail.pointsReward,
    materials: detail.materials.map((material) => ({
      id: material.id,
      title: material.title,
      type: material.type,
      meta: material.type.toUpperCase(),
      url: material.url,
    })),
    homeworkId: detail.homework?.id ?? null,
    homeworkDescription: detail.homework?.description ?? null,
  };
}

export function toBoardPost(post: ApiNewsPost, index: number): BoardPost {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(post.publishedAt)),
    author: post.author.name,
    accent: courseAccents[index % courseAccents.length],
  };
}
