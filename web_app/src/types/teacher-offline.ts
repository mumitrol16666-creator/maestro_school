export type TrialLessonReport = {
  version?: number;
  capturedAt?: string;
  attendance?: {
    outcome?: "attended" | "late" | "no_show" | "rescheduled";
    arrivedWith?: "unknown" | "parent" | "alone" | "other";
    parentPresent?: boolean;
    durationFactMinutes?: number;
  };
  studentProfile?: {
    direction?: string;
    priorExperience?: "unknown" | "none" | "basic" | "medium" | "strong";
    motivation?: "unclear" | "student" | "parent" | "both";
    goalFromParent?: string;
    goalFromStudent?: string;
  };
  teacherAssessment?: {
    interestLevel?: number | null;
    contactLevel?: number | null;
    focusLevel?: number | null;
    rhythm?: number | null;
    hearing?: number | null;
    coordination?: number | null;
    memory?: number | null;
    techniqueBase?: number | null;
    emotionalReadiness?: number | null;
  };
  lessonFacts?: {
    whatWasTested?: string;
    whatWorkedWell?: string;
    difficulties?: string;
    reactionToTasks?: string;
    parentReaction?: string;
    homeworkGiven?: string;
  };
  recommendation?: {
    recommendedFormat?: "undecided" | "group" | "individual" | "hybrid";
    recommendedFrequency?: "undecided" | "1_per_week" | "2_per_week" | "3_per_week" | "custom";
    recommendedLevel?: "beginner" | "basic" | "intermediate" | "advanced";
    firstMonthFocus?: string;
    nextStep?: "manager_call" | "sell_membership" | "second_trial" | "wait" | "reject";
  };
  salesSignals?: {
    buyProbability?: number | null;
    priceSensitivity?: "unknown" | "low" | "medium" | "high";
    scheduleFit?: "unknown" | "good" | "medium" | "bad";
    parentObjections?: string[];
    teacherSalesComment?: string;
  };
  raw?: {
    teacherFreeComment?: string;
    adminComment?: string;
  };
};

export type TeacherOfflineClass = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  duration?: number;
  status: string;
  classType?: string;
  group?: { crmGroupId: string; name: string } | null;
  teacher?: { crmTeacherId: string; name: string } | null;
  room?: { crmRoomId: string; name: string } | null;
  topic?: string | null;
  lessonGoals?: string | null;
  lessonSummary?: string | null;
  homeworkDraft?: string | null;
  nextLessonFocus?: string | null;
  materials?: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }> | null;
  teacherComment?: string | null;
  teacherOutcomeHint?: string | null;
  trialReport?: TrialLessonReport | null;
  trialAiAnalysis?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
};

export type TeacherOfflineAgenda = {
  crmTeacherId: string;
  from: string;
  to: string;
  classes: TeacherOfflineClass[];
};

export type OfflineHomeworkReview = {
  status: "not_checked" | "completed" | "partial" | "not_completed" | "not_assigned";
  completionPercent?: number | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
};

export type HomeworkNotificationRecipient = {
  phone: string;
  label: string;
  audience: "student" | "parent" | "family";
  recipientName?: string | null;
  source: "primary" | "additional";
};

export type TeacherOfflineStudent = {
  crmStudentId: string;
  appUserId?: string | null;
  name: string;
  firstName?: string;
  phone?: string;
  attended: boolean | null;
  attendanceStatus: "unmarked" | "present" | "late" | "excused_absence" | "unexcused_absence";
  teacherNote?: string | null;
  homeworkReview?: OfflineHomeworkReview | null;
  homeworkRecipient?: HomeworkNotificationRecipient | null;
  markedAt?: string | null;
  appMarkedAt?: string | null;
  groupStatus?: string;
};

export type TeacherOfflineClassStudents = {
  crmClassId: string;
  group: { crmGroupId: string; name: string } | null;
  students: TeacherOfflineStudent[];
};

export type WhatsappHomeworkMessageDraft = {
  crmStudentId: string;
  studentName: string;
  recipient: HomeworkNotificationRecipient | null;
  message: string | null;
  source: "ai" | "template" | "unavailable";
  model: string | null;
  note?: string;
};
