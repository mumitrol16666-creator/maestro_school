export type LeagueXpSourceType =
  | "online_lesson"
  | "offline_lesson"
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
  week: {
    startAt: string;
    endAt: string;
    key: string;
    label: string;
    isCurrent: boolean;
    secondsRemaining: number;
  };
  updatedAt: string;
  participantCount: number;
  standings: WeeklyLeagueStanding[];
  currentStudent: {
    eligible: boolean;
    position: number | null;
    xp: number;
    rankDelta: number | null;
    goalXp: number;
    goalProgress: number;
    streakWeeks: number;
    projectedRewardCoins: number;
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
  }>;
  prizes: {
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
  }>;
  excludedCount: number;
};
