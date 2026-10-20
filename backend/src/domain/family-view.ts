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
    currentMembership?: CrmMembership | null;
    memberships?: CrmMembership[];
  };
  upcomingLessons: Array<Record<string, unknown>>;
  lessonHistory?: CrmLesson[];
};

type CrmMembership = {
  crmMembershipId?: string;
  billingModel?: string | null;
  type?: string | null;
  planName?: string | null;
  directionName?: string | null;
  groupName?: string | null;
  classesRemaining?: number | null;
  totalClasses?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  remainingAmountKzt?: number | null;
};

type CrmLesson = {
  crmClassId?: string;
  title?: string | null;
  date?: string | null;
  startTime?: string | null;
  status?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  topic?: string | null;
  lessonSummary?: string | null;
  attended?: boolean | null;
  attendanceStatus?: string | null;
  isPast?: boolean;
};

/** How many past lessons the parent sees (plan 3.2). */
export const FAMILY_VISITS_LIMIT = 10;

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

/**
 * Plan 3.1: the membership as a parent reads it — what it is, how many lessons are left, until
 * when, and what is still to pay. Prices, payments and discounts stay in CRM.
 */
function familyMembership(membership: CrmMembership) {
  const remaining = Number(membership.remainingAmountKzt ?? 0);
  return {
    id: membership.crmMembershipId ?? null,
    title: membership.planName || membership.type || "Абонемент",
    directionName: membership.directionName ?? null,
    groupName: membership.groupName ?? null,
    // A rate card has no lesson count: it is paid per lesson.
    perLesson: membership.billingModel === "rate_card",
    classesRemaining: membership.classesRemaining ?? null,
    totalClasses: membership.totalClasses ?? null,
    validUntil: membership.endDate ?? null,
    amountToPayKzt: Number.isFinite(remaining) ? Math.max(0, remaining) : 0,
  };
}

function familyAttendance(lesson: CrmLesson): "present" | "late" | "excused" | "absent" | "unmarked" | "pending" {
  // Like the student, the parent learns how a lesson went once the school confirmed it.
  if (lesson.status !== "completed") return "pending";
  switch (lesson.attendanceStatus) {
    case "present": return "present";
    case "late": return "late";
    case "excused_absence": return "excused";
    case "unexcused_absence": return "absent";
    default:
      if (lesson.attended === true) return "present";
      if (lesson.attended === false) return "absent";
      return "unmarked";
  }
}

/**
 * Plan 3.2: past lessons as the parent reads them — for a lesson the school has confirmed: came
 * or not, its topic and what was done; before that only that it waits for confirmation.
 * No homework and no teacher's notes.
 */
function familyVisit(lesson: CrmLesson) {
  const confirmed = lesson.status === "completed";
  return {
    crmClassId: lesson.crmClassId ?? null,
    title: lesson.title ?? null,
    date: lesson.date ?? null,
    startTime: lesson.startTime ?? null,
    groupName: lesson.groupName ?? null,
    teacherName: lesson.teacherName ?? null,
    attendance: familyAttendance(lesson),
    confirmed,
    topic: confirmed ? lesson.topic ?? null : null,
    summary: confirmed ? lesson.lessonSummary ?? null : null,
  };
}

const UPCOMING_LESSON_FIELDS = [
  "crmClassId", "title", "date", "startTime", "endTime", "status", "classType",
  "deliveryFormat", "meetingUrl", "groupName", "teacherName", "roomName",
] as const;

/** An upcoming lesson for the parent: when, where and with whom. No homework, notes or materials. */
function familyUpcomingLesson(lesson: Record<string, unknown>) {
  return Object.fromEntries(UPCOMING_LESSON_FIELDS.map((field) => [field, lesson[field] ?? null]));
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
  const memberships = summary.balanceSnapshot.memberships ?? [];
  const current = summary.balanceSnapshot.currentMembership ?? memberships[0] ?? null;
  return {
    profile: {
      name: summary.profile.name,
      groups: summary.profile.groups,
    },
    financialBalance: visibility.showBalance ? {
      signedAmountKzt,
      status: signedAmountKzt < 0 ? "debt" : signedAmountKzt > 0 ? "credit" : "settled",
      source: "crm",
      amountDueKzt: debt,
      membership: current ? familyMembership(current) : null,
      otherMemberships: memberships
        .filter((item) => !current || item.crmMembershipId !== current.crmMembershipId)
        .map(familyMembership),
    } : null,
    upcomingLessons: visibility.showSchedule
      ? summary.upcomingLessons.map(familyUpcomingLesson)
      : [],
    // Attendance belongs with the schedule switch: both are when the child is at the school.
    visits: visibility.showSchedule
      ? (summary.lessonHistory ?? []).filter((lesson) => lesson.isPast !== false).slice(0, FAMILY_VISITS_LIMIT).map(familyVisit)
      : [],
  };
}
