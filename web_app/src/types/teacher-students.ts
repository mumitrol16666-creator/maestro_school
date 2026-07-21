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
  attendanceHistory: Array<{
    crmClassId: string;
    title: string;
    date: string;
    startTime: string;
    classStatus: string;
    attended: boolean;
    attendanceStatus: string;
    chargeAmount: number;
    chargeSource: string | null;
  }>;
  memberships: Array<{
    crmMembershipId: string;
    type: string;
    planName: string | null;
    lessonFormat: string;
    lessonPrice: number | null;
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
  teacher: { crmTeacherId: string; name: string; directions: string[] } | null;
  students: TeacherStudent[];
};
