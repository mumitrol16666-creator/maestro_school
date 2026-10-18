type FamilySummarySource = {
  profile: {
    name: string;
    groups: Array<Record<string, unknown>>;
  };
  balanceSnapshot: {
    debtAmountKzt?: number;
    /** CRM: negative balance plus the unpaid part of active memberships. */
    amountDueKzt?: number | null;
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

/**
 * The one amount a parent owes: CRM's `amountDueKzt` (negative balance plus
 * unpaid membership remainder) when it is present, otherwise the older
 * balance-only debt.
 */
export function parentAmountDueKzt(snapshot: {
  debtAmountKzt?: number | null;
  amountDueKzt?: number | null;
}) {
  const due = snapshot.amountDueKzt ?? snapshot.debtAmountKzt ?? 0;
  const amount = Number(due);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

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
  const debt = parentAmountDueKzt(summary.balanceSnapshot);
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
