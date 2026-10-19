import { apiRequest } from "@/lib/api-client";
import type {
  MaterialKind,
  MaterialLibraryItem,
  ShareableCourse,
  StudentLessonShare,
  StudentLessonShareDetail,
} from "@/types/materials";

/** Plan 1.12: the school's library of materials and course lessons sent to students. */
export const materialsApi = {
  library: (params: { search?: string; kind?: MaterialKind; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.kind) query.set("kind", params.kind);
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return apiRequest<MaterialLibraryItem[]>(`/materials/library${qs ? `?${qs}` : ""}`);
  },
  addLink: (url: string, title: string) =>
    apiRequest<MaterialLibraryItem>("/materials/library/links", { method: "POST", body: JSON.stringify({ url, title }) }),
  uploadFile: (input: { filename: string; mimeType: string; contentBase64: string; title?: string }) =>
    apiRequest<MaterialLibraryItem>("/materials/library/files", { method: "POST", body: JSON.stringify(input) }),
  rename: (id: string, title: string) =>
    apiRequest<MaterialLibraryItem>(`/materials/library/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  remove: (id: string) =>
    apiRequest<{ archived: boolean }>(`/materials/library/${encodeURIComponent(id)}`, { method: "DELETE" }),

  courseLessons: () => apiRequest<ShareableCourse[]>("/teachers/me/course-lessons"),
  shareLesson: (crmStudentId: string, lessonId: string, note?: string) =>
    apiRequest<{ id: string; title: string; resent: boolean }>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/lesson-shares`,
      { method: "POST", body: JSON.stringify({ lessonId, note: note?.trim() || null }) },
    ),

  studentShares: () => apiRequest<StudentLessonShare[]>("/students/me/shared-lessons"),
  studentShare: (shareId: string) => apiRequest<StudentLessonShareDetail>(`/students/me/shared-lessons/${encodeURIComponent(shareId)}`),
};

export const materialKindLabel: Record<MaterialKind, string> = {
  video: "Видео",
  image: "Фото",
  pdf: "PDF",
  audio: "Аудио",
  file: "Файл",
  link: "Ссылка",
};
