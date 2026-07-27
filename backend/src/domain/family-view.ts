type FamilySummarySource = {
  profile: {
    name: string;
    groups: Array<Record<string, unknown>>;
  };
  balanceSnapshot: Record<string, unknown>;
  upcomingLessons: Array<Record<string, unknown>>;
  lessonHistory: Array<Record<string, unknown>>;
  monthlyPlan: Record<string, unknown> | null;
};

function withoutMaterials(lesson: Record<string, unknown>) {
  const { materials: _materials, ...safeLesson } = lesson;
  return safeLesson;
}

export function buildFamilyOfflineSummary(source: unknown) {
  const summary = source as FamilySummarySource;
  return {
    profile: {
      name: summary.profile.name,
      groups: summary.profile.groups,
    },
    balanceSnapshot: summary.balanceSnapshot,
    upcomingLessons: summary.upcomingLessons.map(withoutMaterials),
    lessonHistory: summary.lessonHistory.map(withoutMaterials),
    monthlyPlan: summary.monthlyPlan,
  };
}
