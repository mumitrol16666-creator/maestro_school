export type TeacherTodayAttention = {
  kind: "reports_overdue" | "reports_open" | "proposals_stale" | "proposals_new" | "messages_unread" | "homework_today";
  tone: "danger" | "warning" | "info";
  count: number;
  title: string;
  href: string;
};

export type TeacherTodayLesson = {
  crmClassId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  phase: "upcoming" | "now" | "ended";
  kind: "individual" | "group" | "trial";
  groupName: string | null;
  studentName: string | null;
  roomName: string | null;
  deliveryFormat: "offline" | "online";
  studentsCount: number | null;
  homeworkToCheck: number;
  reportOpen: boolean;
  /** The teacher covers this lesson for the regular teacher. */
  substitution?: boolean;
};

export type TeacherTodayReport = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  status: string;
  groupName: string | null;
  endedAt: string;
  waitedHours: number;
  overdue: boolean;
};

export type TeacherTodayProposal = {
  id: string;
  crmStudentId: string;
  studentName: string;
  kind: "topic" | "song" | "goal";
  text: string;
  direction: string;
  createdAt: string;
  stale: boolean;
};

export type TeacherToday = {
  generatedAt: string;
  date: string;
  crm: { agendaAvailable: boolean; agendaFromCache: boolean; rosterAvailable: boolean };
  attention: TeacherTodayAttention[];
  lessons: TeacherTodayLesson[];
  reports: TeacherTodayReport[];
  proposals: { total: number; items: TeacherTodayProposal[] };
  messages: { unread: number | null };
  birthdays: Array<{ crmStudentId: string; name: string; daysUntil: number; age: number | null }>;
};
