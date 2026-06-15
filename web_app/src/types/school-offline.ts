export type SchoolOfflineLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  classType?: string;
  groupName: string | null;
  teacherName: string | null;
  roomName: string | null;
  topic: string | null;
  lessonGoals: string | null;
  lessonSummary: string | null;
  homework: string | null;
  nextLessonFocus: string | null;
  materials: Array<{ type?: string; url?: string; title?: string }>;
  attended: boolean | null;
  isPast?: boolean;
};

export type SchoolOfflineMembership = {
  crmMembershipId: string;
  type: string;
  planName: string | null;
  directionName: string | null;
  groupName: string;
  teacherName: string | null;
  lessonFormat: string;
  classesRemaining: number;
  individualClassesRemaining?: number | null;
  groupClassesRemaining?: number | null;
  theoryClassesRemaining?: number | null;
  emergencyFreezesAvailable?: number | null;
  emergencyFreezesUsed?: number | null;
  totalClasses: number;
  startDate: string;
  endDate: string;
  totalPriceKzt: number;
  paidAmountKzt: number;
  remainingAmountKzt: number;
  paymentStatus: string;
};

export type StudentOfflineSummary = {
  crmStudentId: string;
  appUserId: string | null;
  externalLinkStatus?: string | null;
  linkStatus?: string;
  profile: {
    name: string;
    phone: string;
    groups: Array<{
      crmGroupId?: string;
      name: string;
      instruments?: Array<{ name: string; quantity: number }>;
      schedules?: Array<{ dayOfWeek: number; time: string; duration?: number }>;
    }>;
  };
  balanceSnapshot: {
    classesRemainingTotal: number;
    debtAmountKzt: number;
    totalPaidAmountKzt: number;
    currentMembership: SchoolOfflineMembership | null;
    memberships: SchoolOfflineMembership[];
  };
  upcomingLessons: SchoolOfflineLesson[];
  lessonHistory: SchoolOfflineLesson[];
};
