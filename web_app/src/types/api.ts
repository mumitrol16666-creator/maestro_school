import type { LessonStatus } from "@/types";
import type { HomeworkTestQuestion, HomeworkType } from "@/types/homework";

export interface ApiDirection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
}

export interface ApiAuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  phone?: string | null;
  role: string;
  permissions?: string[];
  points?: number;
}

export interface LoginResponse {
  token: string;
  user: ApiAuthUser;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface ApiCourseSummary {
  id: string;
  directionId: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  difficultyLevel: string;
  isPublished: boolean;
  direction: Pick<ApiDirection, "id" | "title" | "slug">;
  modulesCount: number;
  lessonsCount: number;
  progress: number;
  enrollmentStatus: string | null;
}

export interface ApiCourseLesson {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  pointsReward: number;
}

export interface ApiCourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  lessons: ApiCourseLesson[];
}

export interface ApiCourseDetail extends Omit<ApiCourseSummary, "modulesCount" | "lessonsCount"> {
  modules: ApiCourseModule[];
}

export interface ApiMaterial {
  id: string;
  type: "pdf" | "image" | "file" | "link";
  title: string;
  url: string;
  sortOrder: number;
}

export interface ApiHomework {
  id: string;
  description: string;
  type: HomeworkType;
  passingScore: number;
  testQuestions: HomeworkTestQuestion[] | null;
}

export interface ApiLessonEndActions {
  askTeacher: { enabled: true } | null;
  signup: {
    enabled: true;
    label: string;
    mode: "course" | "external";
    courseId?: string;
    courseTitle?: string;
    alreadyEnrolled?: boolean;
    externalUrl?: string;
  } | null;
  hasActions: boolean;
}

export interface ApiLessonDetail {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  sortOrder: number;
  pointsReward: number;
  materials: ApiMaterial[];
  homework: ApiHomework | null;
  endActions: ApiLessonEndActions;
  course: { id: string; directionId: string; title: string };
}

export interface StudentAchievementItem {
  code: string;
  title: string;
  description: string | null;
  earned: boolean;
  earnedAt: string | null;
  progressPercent: number;
  progressLabel: string;
}

export interface StudentAchievementsMeta {
  earnedCount: number;
  totalCount: number;
}

export interface ApiDashboard {
  currentCourse: {
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    difficultyLevel: string;
    direction: Pick<ApiDirection, "id" | "title" | "slug">;
  } | null;
  progressPercent: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  points: number;
  nextAvailableLesson: {
    id: string;
    title: string;
    status: LessonStatus | string;
    moduleSortOrder: number;
    sortOrder: number;
  } | null;
}

export interface ApiEnrollment {
  id: string;
  courseId: string;
  status: string;
  course: {
    id: string;
    title: string;
    directionId: string;
    difficultyLevel: string;
    direction: Pick<ApiDirection, "id" | "title" | "slug">;
  };
}

export interface ApiLessonProgress {
  lessonId: string;
  status: LessonStatus | string;
  completedAt: string | null;
  lesson: {
    id: string;
    title: string;
    sortOrder: number;
    pointsReward: number;
    moduleId: string;
    module: { courseId: string; title: string };
  };
}

export interface ApiPointsHistory {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ApiProgress {
  points: number;
  courseProgressPercent?: number;
  enrollments: ApiEnrollment[];
  lessons: ApiLessonProgress[];
  pointsHistory: ApiPointsHistory[];
}

export interface ApiNewsPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  publishedAt: string;
  author: { id: string; name: string };
}

export interface StartLessonResponse {
  lessonId: string;
  status: LessonStatus | string;
  courseId: string;
}

export interface HomeworkSubmissionResponse {
  id: string;
  homeworkId: string;
  status: string;
  attachmentType?: string | null;
  testScore?: number | null;
  testPassed?: boolean | null;
  testResult?: { score: number; correctAnswers: number; totalQuestions: number } | null;
  lessonProgress: LessonStatus | string;
  createdAt: string;
}
