import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";
import type { CmsCourse, CmsCourseTree, CmsDirection, CmsHomework, CmsLesson, CmsMaterial, CmsMaterialUsage, CmsMedia, CmsMeta, CmsModule, CmsNews } from "@/types/cms";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const cmsApi = {
  directions: (search = "", page = 1, limit = 20) => apiRequestEnvelope<CmsDirection[], CmsMeta>(`/admin/directions?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
  createDirection: (body: unknown) => apiRequest<CmsDirection>("/admin/directions", json("POST", body)),
  updateDirection: (id: string, body: unknown) => apiRequest<CmsDirection>(`/admin/directions/${id}`, json("PATCH", body)),
  publishDirection: (id: string, isPublished: boolean) => apiRequest<CmsDirection>(`/admin/directions/${id}/publish`, json("POST", { isPublished })),
  deleteDirection: (id: string) => apiRequest<CmsDirection>(`/admin/directions/${id}`, json("DELETE")),

  courses: (directionId = "", search = "", page = 1, limit = 20) => {
    const params = new URLSearchParams({ search, page: String(page), limit: String(limit) });
    if (directionId) params.set("directionId", directionId);
    return apiRequestEnvelope<CmsCourse[], CmsMeta>(`/admin/courses?${params}`);
  },
  course: (id: string) => apiRequest<CmsCourse>(`/admin/courses/${id}`),
  courseTree: (id: string) => apiRequest<CmsCourseTree>(`/admin/courses/${id}/tree`),
  createCourse: (body: unknown) => apiRequest<CmsCourse>("/admin/courses", json("POST", body)),
  updateCourse: (id: string, body: unknown) => apiRequest<CmsCourse>(`/admin/courses/${id}`, json("PATCH", body)),
  publishCourse: (id: string, isPublished: boolean) => apiRequest<CmsCourse>(`/admin/courses/${id}/publish`, json("POST", { isPublished })),
  deleteCourse: (id: string) => apiRequest<CmsCourse>(`/admin/courses/${id}`, json("DELETE")),

  modules: (courseId: string) => apiRequest<CmsModule[]>(`/admin/modules?courseId=${courseId}`),
  createModule: (body: unknown) => apiRequest<CmsModule>("/admin/modules", json("POST", body)),
  updateModule: (id: string, body: unknown) => apiRequest<CmsModule>(`/admin/modules/${id}`, json("PATCH", body)),
  deleteModule: (id: string) => apiRequest<CmsModule>(`/admin/modules/${id}`, json("DELETE")),

  lessons: (moduleId: string) => apiRequest<CmsLesson[]>(`/admin/lessons?moduleId=${moduleId}`),
  lesson: (id: string) => apiRequest<CmsLesson>(`/admin/lessons/${id}`),
  createLesson: (body: unknown) => apiRequest<CmsLesson>("/admin/lessons", json("POST", body)),
  updateLesson: (id: string, body: unknown) => apiRequest<CmsLesson>(`/admin/lessons/${id}`, json("PATCH", body)),
  publishLesson: (id: string, isPublished: boolean) => apiRequest<CmsLesson>(`/admin/lessons/${id}/publish`, json("POST", { isPublished })),
  deleteLesson: (id: string) => apiRequest<CmsLesson>(`/admin/lessons/${id}`, json("DELETE")),

  materials: (lessonId: string) => apiRequest<CmsMaterial[]>(`/admin/materials?lessonId=${lessonId}`),
  createMaterial: (body: unknown) => apiRequest<CmsMaterial>("/admin/materials", json("POST", body)),
  updateMaterial: (id: string, body: unknown) => apiRequest<CmsMaterial>(`/admin/materials/${id}`, json("PATCH", body)),
  deleteMaterial: (id: string) => apiRequest<CmsMaterial>(`/admin/materials/${id}`, json("DELETE")),
  materialUsages: (id: string) => apiRequest<CmsMaterialUsage[]>(`/admin/materials/${id}/usages`),
  homeworks: (lessonId: string) => apiRequest<CmsHomework[]>(`/admin/homeworks?lessonId=${lessonId}`),
  createHomework: (body: unknown) => apiRequest<CmsHomework>("/admin/homeworks", json("POST", body)),
  updateHomework: (id: string, body: unknown) => apiRequest<CmsHomework>(`/admin/homeworks/${id}`, json("PATCH", body)),
  deleteHomework: (id: string) => apiRequest<CmsHomework>(`/admin/homeworks/${id}`, json("DELETE")),

  news: (search = "", page = 1) => apiRequestEnvelope<CmsNews[], CmsMeta>(`/admin/news?search=${encodeURIComponent(search)}&page=${page}`),
  createNews: (body: unknown) => apiRequest<CmsNews>("/admin/news", json("POST", body)),
  updateNews: (id: string, body: unknown) => apiRequest<CmsNews>(`/admin/news/${id}`, json("PATCH", body)),
  publishNews: (id: string, isPublished: boolean) => apiRequest<CmsNews>(`/admin/news/${id}/publish`, json("POST", { isPublished })),
  deleteNews: (id: string) => apiRequest<CmsNews>(`/admin/news/${id}`, json("DELETE")),

  media: (search = "", folder = "") => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (folder) params.set("folder", folder);
    const query = params.toString();
    return apiRequest<CmsMedia[]>(`/admin/media${query ? `?${query}` : ""}`);
  },
  uploadMedia: (body: unknown) => apiRequest<CmsMedia>("/admin/media", json("POST", body)),
  renameMedia: (folder: string, filename: string, title: string) => apiRequest<CmsMedia>(`/admin/media/${folder}/${filename}`, json("PATCH", { title })),
  deleteMedia: (folder: string, filename: string) => apiRequest(`/admin/media/${folder}/${filename}`, json("DELETE")),
  mediaUsages: (folder: string, filename: string) => apiRequest<CmsMaterialUsage[]>(`/admin/media/${folder}/${filename}/usages`),
};
