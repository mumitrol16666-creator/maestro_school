export type SchoolOfflineLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  classType?: string;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName: string | null;
  teacherName: string | null;
  roomName: string | null;
  topic: string | null;
  lessonGoals: string | null;
  lessonSummary: string | null;
  homework: string | null;
  homeworkReview?: {
    status: "not_checked" | "completed" | "partial" | "not_completed" | "not_assigned";
    completionPercent?: number | null;
    difficulties?: string | null;
    notCompletedReason?: string | null;
  } | null;
  nextLessonFocus: string | null;
  materials: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }>;
  attended: boolean | null;
  isPast?: boolean;
  lessonPoints?: number;
  lessonPointsAwarded?: number | null;
  homeworkResult?: {
    status: "completed" | "partial" | "not_completed";
    completionPercent: number | null;
    reviewedAt: string | null;
  } | null;
  planTopicResults?: Array<{
    itemId: string;
    title: string;
    status: "in_progress" | "completed";
  }>;
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
    accountBalanceKzt: number;
    totalPaidAmountKzt: number;
    currentMembership: SchoolOfflineMembership | null;
    memberships: SchoolOfflineMembership[];
  };
  upcomingLessons: SchoolOfflineLesson[];
  lessonHistory: SchoolOfflineLesson[];
  monthlyPlan: {
    id: string;
    month: string;
    goal: string;
    expectedResult: string;
    skills: string;
    checkpoint: string;
    teacherName: string;
    items: Array<{
      id: string;
      title: string;
      status: "planned" | "in_progress" | "completed" | "moved";
    }>;
    completedCount: number;
    inProgressCount: number;
    plannedCount: number;
    progressPercent: number;
  } | null;
};
