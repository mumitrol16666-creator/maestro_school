import type { LearningHomeworkAttempt, LearningHomeworkMaterial } from "@/types/learning-homework";

export type HomeworkReviewFilterStatus = "submitted" | "reviewed" | "completed" | "rejected";
export type HomeworkReviewSource = "all" | "learning" | "legacy";

export interface HomeworkSubmissionItem {
  model: "legacy_course" | "learning_homework_v2";
  submissionId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  homeworkId: string;
  homeworkDescription: string;
  studentComment: string | null;
  attachmentUrl: string | null;
  attachmentType?: string | null;
  homeworkType?: "assignment" | "test";
  testScore?: number | null;
  testPassed?: boolean | null;
  status: string;
  lessonProgressStatus: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  pointsReward?: number;
  recipientId?: string;
  assignmentId?: string;
  crmStudentId?: string;
  submissionMode?: "materials" | "ready_for_lesson";
  cycleNumber?: number;
  versionInCycle?: number;
  topicId?: string;
  topicProgressPercent?: number;
  scope?: "student" | "group";
  dueAt?: string | null;
  teacherName?: string;
}

export interface LearningHomeworkReviewDetail extends HomeworkSubmissionItem {
  model: "learning_homework_v2";
  assignmentMaterials: LearningHomeworkMaterial[];
  masteryCriteria: string;
  canReview: boolean;
  attempts: LearningHomeworkAttempt[];
}

export type HomeworkReviewDetail = HomeworkSubmissionItem | LearningHomeworkReviewDetail;

export interface HomeworkReviewMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  sources?: { learning: number; legacy: number };
}

export interface HomeworkReviewResponse {
  submission: {
    id: string;
    status: string;
    reviewedAt: string | null;
  };
  lessonStatus: string;
  pointsAwarded: boolean;
}
