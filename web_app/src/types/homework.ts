export type HomeworkAttachmentType = "text" | "video" | "audio" | "file";

export interface HomeworkAttempt {
  id: string;
  homeworkId: string;
  attemptNumber: number;
  comment: string | null;
  attachmentUrl: string | null;
  attachmentType: HomeworkAttachmentType | null;
  status: string;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

export interface HomeworkAttemptsResponse {
  homeworkId: string;
  studentId: string;
  attempts: HomeworkAttempt[];
}
