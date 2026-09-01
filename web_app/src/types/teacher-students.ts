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
    planCompletionRate: number | null;
    currentMonth: string;
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
  state?: "active" | "moved";
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

export type StudentMonthlyPlan = {
  id?: string;
  model?: "learning_topics_v2";
  month: string;
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
  progress?: { completed: number; inProgress: number; total: number; percent: number };
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
  month: string;
  plan: StudentMonthlyPlan | null;
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
  month: string;
  plan: GroupMonthlyPlan | null;
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
