export type ManagementLessonSummary = {
  total: number;
  upcoming: number;
  inProgress: number;
  awaitingReport: number;
  pendingReview: number;
  completed: number;
  cancelled: number;
  notHeld: number;
};

export type ManagementDayLesson = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  classType?: string | null;
  audienceName: string;
  teacherOutcomeHint?: string | null;
  teacher?: { crmTeacherId: string; name: string } | null;
  room?: { crmRoomId: string; name: string } | null;
};

export type ExpectedPaymentStudent = {
  crmStudentId: string;
  name: string;
  phone: string;
  accountBalanceKzt: number;
  expectedTopUpKzt: number;
  hasDebt: boolean;
  direction?: string | null;
  planName?: string | null;
};

export type ManagementDayOverview = {
  date: string;
  generatedAt: string;
  lessons: {
    summary: ManagementLessonSummary;
    items: ManagementDayLesson[];
  };
  payments: {
    thresholdKzt: number;
    count: number;
    debtCount: number;
    expectedRevenueKzt: number;
    students: ExpectedPaymentStudent[];
  };
  attention: {
    pendingReview: number;
    overdueReports: number;
    newBookings: number;
    total: number;
  };
};
