export type HomeworkStatisticsMetrics = {
  assigned: number;
  submitted: number;
  waitingReview: number;
  revision: number;
  accepted: number;
  acceptedFirstPass: number;
  acceptedAfterRevision: number;
  noAttempt: number;
  submissionRate: number | null;
  firstPassRate: number | null;
  averageCycles: number | null;
};

export type HomeworkStatisticsDirection = {
  id: string;
  crmDirectionId: string | null;
  title: string;
  metrics: HomeworkStatisticsMetrics;
};

export type HomeworkStatisticsGroup = {
  crmGroupId: string;
  name: string;
  metrics: HomeworkStatisticsMetrics;
  directions: HomeworkStatisticsDirection[];
};

export type HomeworkStatisticsStudent = {
  id: string;
  userId: string | null;
  crmStudentId: string;
  displayName: string;
  avatar: string | null;
  metrics: HomeworkStatisticsMetrics;
  directions: HomeworkStatisticsDirection[];
};

export type HomeworkStatisticsData = {
  period: {
    month: string;
    basis: "assigned_at";
  };
  filters: {
    directionId: string | null;
  };
  totals: HomeworkStatisticsMetrics;
  directions: HomeworkStatisticsDirection[];
  groups: HomeworkStatisticsGroup[];
  students: {
    items: HomeworkStatisticsStudent[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};
