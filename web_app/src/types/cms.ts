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
  completionCoinsReward: number;
  isPublished: boolean;
  deletedAt: string | null;
  direction: { id: string; title: string };
  _count: { modules: number };
}

export interface CmsCourseTree extends Omit<CmsCourse, "_count"> {
  modules: Array<CmsModule & { lessons: CmsLessonSummary[] }>;
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
  enableAskTeacher: boolean;
  enableLessonSignup: boolean;
  signupCourseId: string | null;
  signupExternalUrl: string | null;
  signupLabel: string | null;
  _count: { materials: number; homeworks: number };
}

export interface CmsLessonSummary {
  id: string;
  moduleId: string;
  title: string;
  sortOrder: number;
  isPublished: boolean;
  hasVideo: boolean;
  _count: { materials: number; homeworks: number };
}

export interface CmsMaterial {
  id: string;
  lessonId: string;
  title: string;
  type: "pdf" | "image" | "file" | "link";
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  media: CmsMedia | null;
}

export interface CmsHomework {
  id: string;
  lessonId: string;
  description: string;
  type: HomeworkType;
  passingScore: number;
  testQuestions: CmsHomeworkTestQuestion[] | null;
  updatedAt?: string;
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
  originalFilename: string;
  title: string;
  folder: "images" | "pdf" | "files";
  mimeType: string | null;
  size: number;
  createdAt: string;
  url: string;
}

export interface CmsMaterialUsage {
  id: string;
  title: string;
  lesson: {
    id: string;
    title: string;
    module: {
      id: string;
      title: string;
      course: { id: string; title: string };
    };
  };
}
import type { CmsHomeworkTestQuestion, HomeworkType } from "./homework";
