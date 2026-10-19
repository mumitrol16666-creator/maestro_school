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
  id: string;
  planId: string;
  crmStudentId: string;
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
  decision: "close_sector" | "retake" | null;
  comment: string | null;
  certificate: { number: string; issuedAt: string | null } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: SectorExamItem[];
};

export type SectorProgressSummary = { completed: number; total: number; percent: number; ready: boolean };

export type AdminSectorExamRow = {
  planId: string;
  sequence: number;
  crmStudentId: string;
  studentName: string;
  direction: { id: string; title: string; crmDirectionId: string | null };
  goal: string;
  progress: SectorProgressSummary;
  exam: SectorExam | null;
};

export type SectorExamItemDraft = {
  kind: "topic" | "custom";
  topicId?: string | null;
  title: string;
  criteria?: string | null;
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
