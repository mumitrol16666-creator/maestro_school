export type AppStatisticsMetrics = {
  activeStudents: number;
  logins: number;
  sessions: number;
  pageViews: number;
  homeworkViews: number;
  homeworkSubmissions: number;
  testsCompleted: number;
};

export type AppStatisticsStudentMetrics = Omit<AppStatisticsMetrics, "activeStudents"> & {
  activeDays: number;
};

export type AppStatisticsData = {
  period: {
    month: string;
    previousMonth: string;
    trackingStartedAt: string | null;
  };
  summary: {
    current: AppStatisticsMetrics;
    previous: AppStatisticsMetrics;
  };
  series: Array<AppStatisticsMetrics & { month: string }>;
  students: {
    items: Array<{
      id: string;
      displayName: string;
      avatar: string | null;
      crmStudentId: string | null;
      lastActiveAt: string | null;
      current: AppStatisticsStudentMetrics;
      previous: AppStatisticsStudentMetrics;
      sections: Array<{ section: string; views: number }>;
      recentEvents: Array<{
        id: string;
        eventType: string;
        section: string;
        path: string | null;
        occurredAt: string;
      }>;
    }>;
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};
