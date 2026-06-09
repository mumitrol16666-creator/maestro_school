export type HomeworkReviewFilterStatus = "submitted" | "reviewed" | "completed" | "rejected";

export interface HomeworkSubmissionItem {
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
  status: string;
  lessonProgressStatus: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  pointsReward?: number;
}

export interface HomeworkReviewMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
