type FamilySummarySource = {
  profile: {
    name: string;
    groups: Array<Record<string, unknown>>;
  };
  balanceSnapshot: {
    debtAmountKzt?: number;
    accountBalanceKzt?: number;
  };
  upcomingLessons: Array<Record<string, unknown>>;
  monthlyPlan: Record<string, unknown> | null;
};

type FamilyVisibility = {
  showSchedule: boolean;
  showBalance: boolean;
  showPlanProgress: boolean;
};

function withoutMaterials(lesson: Record<string, unknown>) {
  const { materials: _materials, ...safeLesson } = lesson;
  return safeLesson;
}

export function buildFamilyOfflineSummary(source: unknown, visibility: FamilyVisibility = {
  showSchedule: true,
  showBalance: true,
  showPlanProgress: true,
}) {
  const summary = source as FamilySummarySource;
  const debt = Math.max(0, Number(summary.balanceSnapshot.debtAmountKzt ?? 0));
  const accountBalance = Number(summary.balanceSnapshot.accountBalanceKzt ?? 0);
  const signedAmountKzt = debt > 0 ? -debt : accountBalance;
  return {
    profile: {
      name: summary.profile.name,
      groups: summary.profile.groups,
    },
    financialBalance: visibility.showBalance ? {
      signedAmountKzt,
      status: signedAmountKzt < 0 ? "debt" : signedAmountKzt > 0 ? "credit" : "settled",
      source: "crm",
    } : null,
    upcomingLessons: visibility.showSchedule
      ? summary.upcomingLessons.map(withoutMaterials)
      : [],
    monthlyPlan: visibility.showPlanProgress ? summary.monthlyPlan : null,
  };
}
