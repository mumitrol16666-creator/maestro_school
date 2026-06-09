export type LessonStatus = "available" | "locked" | "in_progress" | "submitted" | "reviewed" | "completed";
export type CourseAccess = "open" | "locked";

export interface Direction {
  id: string;
  title: string;
  slug: string;
}

export interface Material {
  id: string;
  title: string;
  type: "pdf" | "image" | "file" | "link" | "audio" | "notes";
  meta: string;
  url?: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  description: string;
  order: number;
  duration: string;
  status: LessonStatus;
  pointsReward: number;
  materials: Material[];
  homeworkId?: string | null;
  homeworkDescription?: string | null;
}

export interface Course {
  id: string;
  directionId: string;
  title: string;
  description: string;
  level: string;
  access: CourseAccess;
  progress: number;
  accent: string;
  modulesCount: number;
  lessonsCount: number;
}

export interface Student {
  id: string;
  name: string;
  initials: string;
  directionId: string;
  currentCourseId: string;
  points: number;
  level: number;
}

export interface BoardPost {
  id: string;
  category: "Новость" | "Объявление" | "Событие";
  title: string;
  excerpt: string;
  date: string;
  accent: string;
  featured?: boolean;
}
