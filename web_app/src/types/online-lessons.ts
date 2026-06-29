export type OnlineLessonRequestStatus =
  | "new"
  | "assigned"
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export type OnlineLessonAssignmentSubmissionStatus =
  | "submitted"
  | "approved"
  | "approved_with_remarks"
  | "returned";

export interface OnlineLessonUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string;
  phone: string;
  login: string;
}

export interface OnlineLessonAssignmentMaterial {
  id: string;
  type: "youtube" | "link" | "text" | "pdf" | "image" | "file";
  title: string;
  url: string | null;
  content: string | null;
  sortOrder: number;
}

export interface OnlineLessonAssignmentSubmission {
  id: string;
  comment: string | null;
  attachmentUrl: string | null;
  attachmentType: "text" | "video" | "audio" | "file" | null;
  status: OnlineLessonAssignmentSubmissionStatus;
  reviewComment: string | null;
  reviewPoints: number | null;
  reviewCoins: number | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface OnlineLessonAssignment {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  submissionFormat: "text" | "video" | "audio" | "file";
  pointsReward: number;
  materials: OnlineLessonAssignmentMaterial[];
  submissions: OnlineLessonAssignmentSubmission[];
}

export interface OnlineLessonRequest {
  id: string;
  studentId: string;
  directionId: string | null;
  directionTitle: string;
  level: string;
  preferredTime: string;
  comment: string | null;
  status: OnlineLessonRequestStatus;
  teacherId: string | null;
  scheduledAt: string | null;
  zoomUrl: string | null;
  coveredTopics: string | null;
  whatWorked: string | null;
  whatToImprove: string | null;
  completionComment: string | null;
  lessonPoints: number;
  lessonCoins: number;
  lessonCoinsReason: string | null;
  completedAt: string | null;
  completedById: string | null;
  createdAt: string;
  updatedAt: string;
  student: OnlineLessonUserSummary;
  teacher: OnlineLessonUserSummary | null;
  assignment: OnlineLessonAssignment | null;
}
