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

export type MonthlyPlanItemStatus = "planned" | "in_progress" | "completed" | "moved";

export type MonthlyPlanItem = {
  id: string;
  title: string;
  status: MonthlyPlanItemStatus;
};

export type StudentMonthlyPlan = {
  id?: string;
  month: string;
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: MonthlyPlanItem[];
  updatedAt?: string;
};

export type StudentMonthlyPlanResponse = {
  student: { crmStudentId: string; name: string };
  month: string;
  plan: StudentMonthlyPlan | null;
};
