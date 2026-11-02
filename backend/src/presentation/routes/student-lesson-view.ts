import type { FastifyRequest } from "fastify";
import type { getLessonById } from "../../application/repositories/catalog.repository.js";
import { buildLessonEndActions } from "../../application/services/lesson-signup.service.js";
import { getMediaInfoFromUrl } from "../../application/services/media-storage.service.js";
import { publicHomeworkTestQuestions } from "../../domain/homework-test.js";

type LessonRecord = NonNullable<Awaited<ReturnType<typeof getLessonById>>>;

/** How the lesson came to be open: shown by the player, and what the staff preview reports. */
export type OpenLessonSource = "preview" | "free_course" | "school" | "paid" | "granted" | "free_lesson";

/**
 * The lesson exactly as the student sees it once it is open: description, video, materials, the
 * test without answers, the end actions. Shared by the student route and the staff preview, so the
 * preview can never drift from what the student gets.
 */
export async function buildOpenLessonView(params: {
  lesson: LessonRecord;
  request: FastifyRequest;
  /** The student has started the lesson: video, materials and the test are open. */
  contentOpen: boolean;
  /** Courses the viewer is enrolled in, for the «записаться» end action. */
  enrolledCourseIds: Set<string>;
  source: OpenLessonSource;
  expiresAt: Date | null;
}) {
  const { lesson, request, contentOpen } = params;
  const endActions = contentOpen
    ? buildLessonEndActions(lesson, params.enrolledCourseIds)
    : { askTeacher: null, signup: null, hasActions: false };
  const homework = lesson.homeworks[0];
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    courseId: lesson.module.courseId,
    title: lesson.title,
    description: lesson.description,
    videoUrl: contentOpen ? lesson.videoUrl : null,
    sortOrder: lesson.sortOrder,
    pointsReward: lesson.pointsReward,
    materials: contentOpen
      ? await Promise.all(lesson.materials.map(async (material) => ({
        ...material,
        media: await getMediaInfoFromUrl(material.url, request),
      })))
      : [],
    homework: contentOpen && homework
      ? {
          id: homework.id,
          description: homework.description,
          type: homework.type,
          passingScore: homework.passingScore,
          testQuestions: homework.type === "test"
            ? publicHomeworkTestQuestions(homework.testQuestions)
            : null,
        }
      : null,
    endActions,
    course: lesson.module.course,
    access: {
      kind: "open" as const,
      source: params.source,
      expiresAt: params.expiresAt,
    },
  };
}
