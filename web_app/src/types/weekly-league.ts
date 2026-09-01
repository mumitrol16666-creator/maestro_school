export type LeagueXpSourceType =
  | "online_lesson"
  | "offline_lesson"
  | "learning_homework"
  | "course_homework"
  | "online_assignment"
  | "prepared_test"
  | "monthly_plan"
  | "teacher_bonus";

export type WeeklyLeagueStanding = {
  position: number;
  studentId?: string;
  displayName: string;
  xp: number;
  eventCount: number;
  rankDelta: number | null;
  isCurrentStudent: boolean;
  awardedCoins: number;
};

export type WeeklyLeagueOverview = {
  economyV2Enabled: boolean;
  week: {
    startAt: string;
    endAt: string;
    key: string;
    label: string;
    isCurrent: boolean;
    secondsRemaining: number;
    phase: "live" | "finalizing" | "finalized";
    positionsFinal: boolean;
    finalizesAt: string;
  };
  updatedAt: string;
  participantCount: number;
  standings: WeeklyLeagueStanding[];
  currentStudent: {
    eligible: boolean;
    position: number | null;
    xp: number;
    eventCount: number;
    rankDelta: number | null;
    goalXp: number;
    goalProgress: number;
    streakWeeks: number;
    bestStreakWeeks: number;
    streakOutcome: "extended" | "frozen" | "broken" | "corrected" | null;
    projectedRewardCoins: number;
    coinBreakdown: {
      attendance: number;
      placement: number;
      personalGoal: number;
      milestone: number;
    };
    streakMilestones: Array<{
      weeks: number;
      coins: number;
      title: string;
      earned: boolean;
      earnedAt: string | null;
    }>;
    breakdown: Array<{
      sourceType: LeagueXpSourceType;
      label: string;
      xp: number;
    }>;
    recentEvents: Array<{
      sourceType: LeagueXpSourceType;
      label: string;
      description: string;
      xp: number;
      createdAt: string;
    }>;
  } | null;
  highlights: {
    leader: WeeklyLeagueStanding | null;
    breakthrough: {
      studentId: string;
      displayName: string;
      gain: number;
    } | null;
  };
  rules: Array<{
    sourceType: LeagueXpSourceType;
    label: string;
    xp: number;
    retryXp?: number;
    weeklyLimit?: number;
  }>;
  prizes: {
    rewardsEnabled: boolean;
    placements: Array<{
      position: number;
      awardType: string;
      coins: number;
      label: string;
    }>;
    personalGoal: {
      xp: number;
      coins: number;
      label: string;
    };
  };
};

export type WeeklyLeagueHistoryItem = {
  snapshotId: string;
  week: {
    key: string;
    label: string;
    startAt: string;
    endAt: string;
    finalizedAt: string;
  };
  participantCount: number;
  position: number;
  xp: number;
  eventCount: number;
  goalXp: number;
  goalMet: boolean;
  coinsAwarded: number;
  coinBreakdown: {
    attendance: number;
    placement: number;
    personalGoal: number;
    milestone: number;
  };
  streakWeeks: number;
  streakOutcome: "extended" | "frozen" | "broken";
  milestonesEarned: number[];
  breakdown: Array<{
    sourceType: LeagueXpSourceType;
    label: string;
    xp: number;
  }>;
  topThree: Array<{
    position: number;
    displayName: string;
    xp: number;
    coinsAwarded: number;
    isCurrentStudent: boolean;
  }>;
};

export type WeeklyLeagueHistory = {
  economyV2Enabled: boolean;
  items: WeeklyLeagueHistoryItem[];
  nextCursor: string | null;
};

export type AdminWeeklyLeagueOverview = WeeklyLeagueOverview & {
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    login: string | null;
    isActive: boolean;
    leagueEligible: boolean;
    effectiveEligible: boolean;
    xp: number;
    position: number | null;
    streakWeeks: number;
    bestStreakWeeks: number;
    streakProtection: {
      id: string;
      source: "crm" | "curator";
      category: "school_holiday" | "subscription_pause" | "all_lessons_cancelled" | "illness" | "family" | "other";
      comment: string;
      createdAt: string;
    } | null;
  }>;
  excludedCount: number;
};

export type PointsLeaderboardStanding = {
  position: number;
  displayName: string;
  points: number;
  level: {
    level: number;
    code: string;
    title: string;
    minPoints: number;
    tone: import("./api").ProductLevelTone;
    emblem: import("./api").ProductLevelEmblem;
  };
  isCurrentStudent: boolean;
};

export type PointsLeaderboardOverview = {
  enabled: boolean;
  economicEpoch: { code: string; startsAt: string } | null;
  updatedAt: string;
  participantCount: number;
  allBalancesEqual: boolean;
  standings: PointsLeaderboardStanding[];
  currentStudent: PointsLeaderboardStanding | null;
};
