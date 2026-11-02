export type SchoolOfflineLesson = {
  legacyResolution?: { decision: "accepted" | "continue" | "obsolete"; comment: string; updatedAt: string } | null;
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  classType?: string;
  deliveryFormat?: "offline" | "online";
  meetingUrl?: string | null;
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
    sourceCrmClassId?: string | null;
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
    reviewConfidence: "exact" | "legacy_derived";
  } | null;
  planTopicResults?: Array<{
    itemId: string;
    title: string;
    status: "in_progress" | "completed";
  }>;
  learningTopicResults?: Array<{
    topicId: string;
    title: string;
    fromPercent: number | null;
    toPercent: number;
    comment: string | null;
    occurredAt: string;
    mastered: boolean;
    masteryPointsAwarded: number;
  }>;
  learningPlanCompletionResults?: Array<{
    planId: string;
    month: string;
    sequence?: number | null;
    completedAt: string;
    pointsAwarded: number;
  }>;
  /** Plan 2.7: XP for coming and the teacher's bonus of the same day. */
  lessonRewards?: { xp: number; bonusXp: number } | null;
  /** Plan 2.7: the sector before and after this lesson. */
  sectorProgress?: {
    planId: string;
    sequence: number | null;
    direction: string | null;
    fromPercent: number;
    toPercent: number;
    completed: number;
    total: number;
  } | null;
  /** Plan 2.7: the teacher's check of the previous homework made on this lesson. */
  homeworkChecks?: Array<{ topicTitle: string; completionPercent: number; comment: string | null; reviewedAt: string }>;
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
  /** Plan 2.7: the current streak of weeks, shown in the lesson result. */
  streakWeeks?: number | null;
  externalLinkStatus?: string | null;
  linkStatus?: string;
  /** CRM did not answer; the server served its last copy taken at `crmSnapshotAt` (З-88). */
  crmStale?: boolean;
  crmSnapshotAt?: string | null;
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
};
