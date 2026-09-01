import type { LessonStatus } from "@/types";
import type { HomeworkTestQuestion, HomeworkType } from "@/types/homework";
import type { StudentOfflineSummary } from "@/types/school-offline";

export interface ApiDirection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
}

export interface ApiAuthUser {
  id: string;
  login?: string;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  avatar?: string | null;
  profileBio?: string | null;
  profileInstrument?: string | null;
  profileInterests?: string[];
  profilePublic?: boolean;
  avatarSyncStatus?: "synced" | "not_linked" | "failed";
  phone?: string | null;
  role: string;
  permissions?: string[];
  productFeatures?: {
    learningTopicsV2: boolean;
    studentWorkspaceV2: boolean;
    homeworkFlowV2: boolean;
    unifiedLessonV2: boolean;
    lessonSyncV2: boolean;
    rewardEconomyV2: boolean;
    curatorWorkspaceV2: boolean;
    learningDialogsV2: boolean;
    roleNavigationV2: boolean;
  };
  points?: number;
  coins?: number;
}

export interface LoginResponse {
  token: string;
  user: ApiAuthUser;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  phone: string;
  password: string;
}

export interface TrialBookingInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  direction: string;
  level: string;
  preferredTime: string;
  comment?: string;
  marketingClientId?: string;
  marketingSessionId?: string;
  attribution?: Record<string, unknown>;
  landingUrl?: string;
  referrerUrl?: string;
}

export interface TrialBookingResponse {
  bookingId: string;
  status: string;
  replyChannel: "whatsapp";
}

export interface ApiCourseSummary {
  id: string;
  directionId: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  difficultyLevel: string;
  completionCoinsReward: number;
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
  media?: {
    filename: string;
    originalFilename: string;
    title: string;
    folder: "images" | "pdf" | "files";
    mimeType: string | null;
    size: number;
    url: string;
  } | null;
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
  rank: StudentRankOverview;
  level: ProductLevelProgress | null;
  nextAvailableLesson: {
    id: string;
    title: string;
    status: LessonStatus | string;
    moduleSortOrder: number;
    sortOrder: number;
  } | null;
}

export interface StudentHomeHomework {
  id: string;
  sourceLessonId: string;
  title: string;
  description: string;
  status: "todo" | "needs_revision" | "completed";
  teacherName: string | null;
  assignedAt: string;
  due: {
    kind: "next_lesson";
    date: string;
    time: string;
    lessonId: string;
  } | null;
  review: {
    status: string;
    completionPercent: number | null;
    feedback: string | null;
  } | null;
  href: string;
}

export interface StudentHomeMonthlyPlan {
  id: string;
  scope: "student" | "group";
  targetId: string;
  month: string;
  direction?: {
    id: string;
    crmDirectionId: string | null;
    title: string;
    isActive: boolean | null;
    syncedAt: string | null;
  };
  teacher: { name: string };
  goal: string;
  expectedResult?: string;
  skills?: string;
  checkpoint?: string;
  note?: string;
  materials?: Array<{ id: string; title: string; url: string; note: string }>;
  items: Array<{
    id: string;
    title: string;
    masteryCriteria?: string;
    status: "planned" | "in_progress" | "completed" | "moved";
    progressPercent?: number | null;
    state?: "active" | "moved";
  }>;
  progress: { completed: number; inProgress: number; total: number; percent: number };
  publishedAt: string;
}

export interface StudentMonthlyPlansResponse {
  month: string;
  plans: StudentHomeMonthlyPlan[];
  aggregateProgress: {
    completed: number;
    total: number;
    percent: number;
  };
}

export interface ApiStudentHome {
  generatedAt: string;
  dashboard: ApiDashboard;
  school: StudentOfflineSummary | null;
  monthlyPlans: StudentHomeMonthlyPlan[];
  currentHomework: StudentHomeHomework | null;
  lastHomeworkReview: StudentHomeHomework | null;
}

export interface CompleteLessonResponse {
  lessonId: string;
  courseId: string;
  status: "completed";
  alreadyCompleted: boolean;
  nextLessonId: string | null;
  courseCompleted: boolean;
}

export interface StudentRankOverview {
  current: { code: string; title: string; minPoints: number };
  next: { code: string; title: string; minPoints: number } | null;
  points: number;
  pointsToNext: number;
  progressPercent: number;
  isMaxRank: boolean;
}

export type ProductLevelTone =
  | "graphite"
  | "silver"
  | "green"
  | "emerald"
  | "gold"
  | "amber"
  | "orange"
  | "fire_orange"
  | "crimson"
  | "red";

export type ProductLevelEmblem =
  | "disc"
  | "square"
  | "diamond"
  | "hexagon"
  | "pentagon"
  | "shield"
  | "octagon"
  | "notched"
  | "crest"
  | "crown";

export interface ProductLevelItem {
  level: number;
  code: string;
  title: string;
  minPoints: number;
  tone: ProductLevelTone;
  emblem: ProductLevelEmblem;
}

export interface ProductLevelProgress {
  level: ProductLevelItem;
  next: ProductLevelItem | null;
  levels?: ProductLevelItem[];
  points: number;
  pointsToNext: number;
  earnedWithinLevel: number;
  requiredWithinLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface StudentPointsReadModel {
  mode: "legacy" | "level";
  economicEpoch: { id: string; code: string; startsAt: string } | null;
  points: number;
  level: ProductLevelProgress | null;
}

export interface StudentEconomyProfile {
  economyV2Enabled: boolean;
  points: number;
  level: ProductLevelProgress | null;
  coins: number;
  streak: {
    currentWeeks: number;
    bestWeeks: number;
  } | null;
  milestones: Array<{
    weeks: number;
    coins: number;
    title: string;
    earned: boolean;
    earnedAt: string | null;
  }>;
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
  level: ProductLevelProgress | null;
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
