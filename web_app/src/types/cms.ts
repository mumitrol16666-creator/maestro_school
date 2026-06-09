export interface CmsMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface CmsDirection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isPublished: boolean;
  deletedAt: string | null;
}

export interface CmsCourse {
  id: string;
  directionId: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  difficultyLevel: string;
  isPublished: boolean;
  deletedAt: string | null;
  direction: { id: string; title: string };
  _count: { modules: number };
}

export interface CmsModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  _count: { lessons: number };
}

export interface CmsLesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  pointsReward: number;
  sortOrder: number;
  isPublished: boolean;
  _count: { materials: number; homeworks: number };
}

export interface CmsMaterial {
  id: string;
  lessonId: string;
  title: string;
  type: "pdf" | "image" | "file" | "link";
  url: string;
  sortOrder: number;
}

export interface CmsHomework {
  id: string;
  lessonId: string;
  description: string;
}

export interface CmsNews {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  publishedAt: string | null;
  deletedAt: string | null;
  author: { firstName: string; lastName: string };
}

export interface CmsMedia {
  filename: string;
  folder: "images" | "pdf" | "files";
  size: number;
  createdAt: string;
  url: string;
}
