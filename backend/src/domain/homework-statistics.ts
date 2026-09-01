export type HomeworkStatisticsFact = {
  state: "assigned" | "waiting_review" | "revision" | "accepted" | "accepted_with_comment";
  currentCycle: number;
  attemptCount: number;
};

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

const acceptedStates = new Set(["accepted", "accepted_with_comment"]);

function roundedRate(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : null;
}

export function calculateHomeworkStatistics(
  facts: readonly HomeworkStatisticsFact[],
): HomeworkStatisticsMetrics {
  let submitted = 0;
  let waitingReview = 0;
  let revision = 0;
  let accepted = 0;
  let acceptedFirstPass = 0;
  let acceptedAfterRevision = 0;
  let acceptedCycles = 0;

  for (const fact of facts) {
    if (fact.attemptCount > 0) submitted += 1;
    if (fact.state === "waiting_review") waitingReview += 1;
    if (fact.state === "revision") revision += 1;
    if (!acceptedStates.has(fact.state)) continue;

    accepted += 1;
    acceptedCycles += Math.max(1, fact.currentCycle);
    if (fact.currentCycle <= 1) acceptedFirstPass += 1;
    else acceptedAfterRevision += 1;
  }

  const assigned = facts.length;
  return {
    assigned,
    submitted,
    waitingReview,
    revision,
    accepted,
    acceptedFirstPass,
    acceptedAfterRevision,
    noAttempt: assigned - submitted,
    submissionRate: roundedRate(submitted, assigned),
    firstPassRate: roundedRate(acceptedFirstPass, accepted),
    averageCycles: accepted ? Math.round((acceptedCycles / accepted) * 10) / 10 : null,
  };
}
