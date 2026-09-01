export type LearningHomeworkMaterial = {
  type: "link" | "audio" | "video" | "file";
  url: string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  privateFile?: boolean;
};

export type LearningHomeworkRecipientState =
  | "assigned"
  | "waiting_review"
  | "revision"
  | "accepted"
  | "accepted_with_comment";

export type LearningHomeworkAttempt = {
  id: string;
  attemptNumber: number;
  cycleNumber: number;
  versionInCycle: number;
  submissionMode: "materials" | "ready_for_lesson";
  text: string | null;
  materials: LearningHomeworkMaterial[];
  status: "waiting_review" | "superseded" | "revision" | "accepted" | "accepted_with_comment";
  previousAttemptId: string | null;
  submittedAt: string;
  review: {
    id: string;
    decision: "revision" | "accepted" | "accepted_with_comment";
    comment: string | null;
    reviewedAt: string;
    reviewerName: string;
  } | null;
};

export type StudentLearningHomeworkAssignment = {
  id: string;
  model: "learning_homework_v2";
  recipientId: string;
  state: LearningHomeworkRecipientState;
  currentCycle: number;
  acceptedAt: string | null;
  topic: {
    id: string;
    title: string;
    masteryCriteria: string;
    direction: {
      id: string;
      title: string;
      crmDirectionId: string | null;
    };
    scope: "student" | "group";
  };
  instructions: string;
  materials: LearningHomeworkMaterial[];
  sourceLessonId: string | null;
  dueAt: string | null;
  assignedAt: string;
  teacherName: string;
  latestAttempt: LearningHomeworkAttempt | null;
  attempts: LearningHomeworkAttempt[];
};

export type StudentLearningHomeworkResponse = {
  enabled: boolean;
  model: "learning_homework_v2" | "legacy";
  assignments: StudentLearningHomeworkAssignment[];
};

export type TeacherLearningHomeworkAssignment = {
  id: string;
  model: "learning_homework_v2";
  topic: {
    id: string;
    title: string;
    masteryCriteria: string;
    direction: {
      id: string;
      crmDirectionId: string | null;
      title: string;
    };
    owner:
      | { kind: "group"; crmGroupId: string }
      | { kind: "student"; crmStudentId: string };
  };
  instructions: string;
  materials: LearningHomeworkMaterial[];
  sourceLessonId: string | null;
  dueAt: string | null;
  assignedAt: string;
  createdBy: {
    id: string | null;
    name: string;
  };
  recipientCount: number;
  recipients: Array<{
    id: string;
    crmStudentId: string;
    studentUserId: string | null;
    state: LearningHomeworkRecipientState;
    currentCycle: number;
    acceptedAt: string | null;
  }>;
};

export type CreatedLearningHomeworkAssignment = TeacherLearningHomeworkAssignment & {
  idempotent: boolean;
};

export type TeacherLearningHomeworkResponse = {
  model: "learning_homework_v2";
  assignments: TeacherLearningHomeworkAssignment[];
};
