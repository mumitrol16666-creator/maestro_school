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
  homework: string | null;
  attended: boolean | null;
  isPast?: boolean;
};

export type SchoolOfflineMembership = {
  crmMembershipId: string;
  type: string;
  groupName: string;
  classesRemaining: number;
  totalClasses: number;
  endDate: string;
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
    groups: Array<{ crmGroupId?: string; name: string; direction?: string }>;
  };
  balanceSnapshot: {
    classesRemainingTotal: number;
    debtAmountKzt: number;
    memberships: SchoolOfflineMembership[];
  };
  upcomingLessons: SchoolOfflineLesson[];
  lessonHistory: SchoolOfflineLesson[];
};
