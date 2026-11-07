import { apiRequest } from "@/lib/api-client";
import type { ApiLessonDetail } from "@/types/api";

/**
 * «Посмотреть как ученик»: the lesson exactly as GET /lessons/:id answers it for an open lesson,
 * with `access.source = "preview"`. The server writes no progress and no enrollment for it.
 */
export type LessonPreview = Pick<
  ApiLessonDetail,
  "id" | "courseId" | "title" | "description" | "videoUrl" | "materials" | "homework" | "course"
> & {
  access: { kind: "open"; source: "preview"; expiresAt: string | null };
};

export const lessonPreviewApi = {
  get: (lessonId: string) => apiRequest<LessonPreview>(`/admin/lessons/${lessonId}/student-view`),
};

export function lessonPreviewHref(courseId: string, lessonId: string) {
  return `/admin/courses/${courseId}/lessons/${lessonId}/preview`;
}
