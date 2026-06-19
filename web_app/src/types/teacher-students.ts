export type TeacherStudentSource = "offline" | "online";

export type TeacherStudent = {
  key: string;
  appUserId: string | null;
  crmStudentId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  email: string | null;
  login: string | null;
  avatarUrl: string | null;
  learningLevel: string | null;
  accountBalance: number | null;
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
  memberships: Array<{
    crmMembershipId: string;
    type: string;
    classesRemaining: number;
    endDate: string;
    group: {
      crmGroupId: string;
      name: string;
      direction: string;
    } | null;
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
};

export type TeacherStudentsResponse = {
  teacher: { crmTeacherId: string; name: string } | null;
  students: TeacherStudent[];
};
