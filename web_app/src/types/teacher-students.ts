export type TeacherStudentSource = "offline" | "online";

export type TeacherStudent = {
  key: string;
  appUserId: string | null;
  crmStudentId: string | null;
  firstName: string;
  lastName: string;
  middleName: string;
  name: string;
  dateOfBirth: string | null;
  phone: string;
  email: string | null;
  login: string | null;
  avatarUrl: string | null;
  learningLevel: string | null;
  externalLinkStatus: string | null;
  directions: string[];
  groups: Array<{
    crmGroupId: string;
    name: string;
    direction: string;
    level: string;
  }>;
  schedules: Array<{
    id: string;
    dayOfWeek: number;
    time: string;
    duration: number;
  }>;
  attendanceHistory: Array<{
    crmClassId: string;
    title: string;
    date: string;
    startTime: string;
    classStatus: string;
    attended: boolean;
    attendanceStatus: string;
  }>;
  sources: TeacherStudentSource[];
  /** Present while the teacher covers this student's lesson; access ends when the lesson is approved. */
  substitution?: { crmClassId: string; lessonDate: string | null; originalCrmTeacherId: string } | null;
  onlineLessons: Array<{
    id: string;
    status: string;
    directionTitle: string;
    scheduledAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  appActivity: {
    lastActiveAt: string | null;
    lastLoginAt: string | null;
  };
  family: {
    parents: Array<{
      id: string;
      name: string;
      relationship: string;
    }>;
  };
  learningSummary: {
    attendanceRate: number | null;
    homeworkCompletionRate: number | null;
    sector: { sequence: number; completed: number; total: number } | null;
  };
  attentionSignals: Array<{
    code: string;
    title: string;
    action: string;
    tone: "warning" | "danger";
  }>;
};

export type TeacherStudentsResponse = {
  teacher: { crmTeacherId: string; name: string; directions: string[] } | null;
  students: TeacherStudent[];
};

export type TeacherGroupStudent = {
  crmStudentId: string;
  name: string;
  avatarUrl: string | null;
  assignedDirectly: boolean;
};

export type TeacherGroup = {
  crmGroupId: string;
  name: string;
  direction: string;
  level: string;
  color: string | null;
  description: string | null;
  maxStudents: number;
  schedules: Array<{
    id: string;
    dayOfWeek: number;
    time: string;
    duration: number;
    room: {
      crmRoomId: string;
      name: string;
    } | null;
  }>;
  students: TeacherGroupStudent[];
  planSummary: {
    month: string;
    configured: boolean;
    itemsTotal: number;
    itemsCompleted: number;
    completionRate: number | null;
  };
};

export type TeacherGroupsResponse = {
  teacher: { crmTeacherId: string; name: string; directions: string[] } | null;
  groups: TeacherGroup[];
};

export type MonthlyPlanItemStatus = "planned" | "in_progress" | "completed" | "moved";

export type MonthlyPlanItem = {
  id: string;
  title: string;
  status: MonthlyPlanItemStatus;
  masteryCriteria?: string;
  progressPercent?: number | null;
  state?: "active" | "transferred" | "replaced";
};

export type TeacherCrmDirection = {
  id: string;
  crmDirectionId: string;
  title: string;
  isActive: boolean | null;
  updatedAt: string | null;
  syncedAt: string | null;
};

export type LearningPlanMode = {
  mode: "legacy" | "v2";
  directions: TeacherCrmDirection[];
};

export type SectorPreparedTest = { id: string; title: string; passedAt: string | null };

export type SectorHistoryEntry = {
  id: string;
  sequence: number;
  goal: string;
  closedAt: string | null;
  closeReason: string | null;
  completedAt: string | null;
  topicsTotal: number;
  topicsCompleted: number;
};

export type StudentMonthlyPlan = {
  id?: string;
  model?: "learning_topics_v2";
  /** Month the sector was opened in; informational only. */
  month?: string;
  sequence?: number;
  status?: "active" | "closed";
  closedAt?: string | null;
  closeReason?: string | null;
  templateStepId?: string | null;
  /** Write-only: template to open the next sector from. */
  templateStepIdInput?: string | null;
  direction?: {
    id: string;
    crmDirectionId: string | null;
    title: string;
    isActive: boolean | null;
    syncedAt: string | null;
  };
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: MonthlyPlanItem[];
  progress?: {
    completed: number;
    inProgress: number;
    total: number;
    percent: number;
    transferred?: number;
    originalTotal?: number;
  };
  publication?: {
    isPublished: boolean;
    publishedAt: string | null;
    draftRevision: number;
    publishedRevision: number;
    hasUnpublishedChanges: boolean;
  };
  version?: number;
  expectedVersion?: number;
  versions?: Array<{
    version: number;
    createdAt: string;
    publishedAt: string | null;
    itemCount: number;
    author: string;
  }>;
  teacher?: { name: string };
  updatedAt?: string;
};

export type StudentMonthlyPlanResponse = {
  student: { crmStudentId: string; name: string };
  direction?: { crmDirectionId: string; title: string };
  month?: string;
  nextSequence?: number;
  plan: StudentMonthlyPlan | null;
  history?: SectorHistoryEntry[];
};

export type GroupPlanMaterial = {
  id: string;
  title: string;
  url: string;
  note: string;
};

export type GroupMonthlyPlan = StudentMonthlyPlan & {
  materials: GroupPlanMaterial[];
};

export type GroupMonthlyPlanResponse = {
  group: { crmGroupId: string; name: string };
  direction?: { crmDirectionId: string; title: string };
  month?: string;
  nextSequence?: number;
  plan: GroupMonthlyPlan | null;
  history?: SectorHistoryEntry[];
};


export type LearningTopicDetail = {
  id: string;
  crmStudentId: string | null;
  crmGroupId: string | null;
  direction: { crmDirectionId: string; title: string };
  title: string;
  masteryCriteria: string;
  progressPercent: number | null;
  status: Exclude<MonthlyPlanItemStatus, "moved">;
  masteredAt: string | null;
  history: Array<{
    id: string;
    fromPercent: number | null;
    toPercent: number;
    source: string;
    sourceKey: string;
    comment: string | null;
    changedById: string | null;
    occurredAt: string;
  }>;
  idempotent?: boolean;
};

export type SectorTemplateTopic = {
  id: string;
  line: "melody" | "chords" | "theory" | "song" | "other";
  title: string;
  masteryCriteria: string;
  materials: Array<{ title: string; url: string; note?: string }>;
};

export type SectorTemplate = {
  id: string;
  number: number;
  title: string;
  summary: string;
  isPublished: boolean;
  direction: { crmDirectionId: string | null; title: string } | null;
  preparedTest: { id: string; title: string; known: boolean } | null;
  topics: SectorTemplateTopic[];
  updatedAt: string;
};

export type PreparedTestOption = { id: string; title: string; description: string };

export type SectorProposal = {
  id: string;
  kind: "topic" | "song" | "goal";
  text: string;
  link: string | null;
  status: "new" | "accepted" | "declined";
  teacherReply: string | null;
  acceptedTopicId: string | null;
  direction: { crmDirectionId: string | null; title: string };
  sector: { id: string; sequence: number; status: string } | null;
  student: { id: string; name: string; crmStudentId: string };
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  createdAt: string;
};
