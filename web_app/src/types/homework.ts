export type HomeworkAttachmentType = "text" | "video" | "audio" | "file";
export type HomeworkType = "assignment" | "test";

export interface HomeworkTestOption {
  id: string;
  text: string;
}

export interface HomeworkTestQuestion {
  id: string;
  prompt: string;
  options: HomeworkTestOption[];
}

export interface CmsHomeworkTestQuestion extends HomeworkTestQuestion {
  correctOptionId: string;
}

export interface HomeworkAttempt {
  id: string;
  homeworkId: string;
  attemptNumber: number;
  comment: string | null;
  attachmentUrl: string | null;
  attachmentType: HomeworkAttachmentType | null;
  testScore: number | null;
  testPassed: boolean | null;
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
