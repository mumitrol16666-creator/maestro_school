export type SectorExamStatus = "draft" | "awaiting_schedule" | "scheduled" | "in_progress" | "completed" | "cancelled";
export type SectorExamOutcome = "passed" | "partial" | "failed";

export type SectorExamItem = {
  id: string;
  kind: "topic" | "custom";
  topicId: string | null;
  title: string;
  criteria: string;
  position: number;
  done: boolean | null;
};

export type SectorExam = {
  sessionId: string;
  sessionTitle?: string | null;
  programTitle?: string | null;
  id: string;
  planId: string;
  crmStudentId: string;
  /** Historical group context; new attempts belong to the pupil's personal sector. */
  crmGroupId: string | null;
  direction: { id: string; title: string; crmDirectionId: string | null };
  status: SectorExamStatus;
  attempt: number;
  previousExamId: string | null;
  sentForScheduleAt: string | null;
  crmClassId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: SectorExamOutcome | null;
  decision: "close_sector" | "pass" | "retake" | null;
  comment: string | null;
  certificate: { number: string; issuedAt: string | null } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: SectorExamItem[];
};

export type SectorProgressSummary = { completed: number; total: number; percent: number; ready: boolean; readyAt?: string | null; studyFinishedAt?: string | null };

export type AdminSectorExamRow = {
  planId: string;
  sequence: number;
  curriculumNumber?: number;
  crmStudentId: string;
  studentName: string;
  direction: { id: string; title: string; crmDirectionId: string | null };
  goal: string;
  progress: SectorProgressSummary;
  exam: SectorExam | null;
};

export type TeacherSectorExamRow = {
  planId: string;
  sequence: number;
  direction: { id: string; title: string; crmDirectionId: string | null };
  progress: SectorProgressSummary;
  exam: SectorExam | null;
  previousExam: SectorExam | null;
  canStart: boolean;
};

/** What the student and parent see: marks only once the exam is over. */
export type PublicSectorExam = {
  id: string;
  status: "awaiting_schedule" | "scheduled" | "in_progress" | "completed";
  attempt: number;
  scheduledAt: string | null;
  finishedAt: string | null;
  outcome: SectorExamOutcome | null;
  certificate: { number: string; issuedAt: string | null } | null;
  items: Array<{ id: string; title: string; criteria: string; done: boolean | null }>;
};

export type ExamSessionWorkspace = {
  id: string;
  title: string;
  program: { title: string; sectorNumber: number; durationMinutes: number; items: Array<{ title: string; criteria: string }> };
  participants: Array<{ studentName: string; ready: boolean; canConduct: boolean; canStart: boolean; exam: SectorExam }>;
};
