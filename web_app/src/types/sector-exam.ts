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
  /** Plan 1.13: set when this is one member's exam of a group sector. */
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

export type SectorMemberPass = { method: "exam" | "manual"; passedAt: string; points: number };

export type GroupSectorMember = {
  crmStudentId: string;
  name: string;
  inGroup: boolean;
  exam: SectorExam | null;
  pass: SectorMemberPass | null;
};

/** Plan 1.13: an open group sector on the admin's board, with each member's exam and pass. */
export type AdminGroupSectorRow = {
  planId: string;
  sequence: number;
  crmGroupId: string;
  groupName: string | null;
  rosterAvailable: boolean;
  direction: { id: string; title: string; crmDirectionId: string | null };
  goal: string;
  progress: SectorProgressSummary;
  members: GroupSectorMember[];
};

/** Plan 1.13: the group page — the open sector and closed ones where a member still has an exam. */
export type TeacherGroupSectorExams = {
  group: { crmGroupId: string; name: string };
  sectors: Array<{
    planId: string;
    sequence: number;
    status: "active" | "closed";
    closedAt: string | null;
    direction: { id: string; title: string; crmDirectionId: string | null };
    progress: SectorProgressSummary;
    members: Array<GroupSectorMember & { canStart: boolean }>;
  }>;
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
