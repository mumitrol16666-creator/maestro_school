export type RewardStatus = "requested" | "approved" | "fulfilled" | "rejected";

const transitions: Record<RewardStatus, RewardStatus[]> = {
  requested: ["approved", "fulfilled", "rejected"],
  approved: ["fulfilled", "rejected"],
  fulfilled: [],
  rejected: [],
};

export function canTransitionRewardStatus(from: RewardStatus, to: RewardStatus) {
  return from === to || transitions[from].includes(to);
}

export function rewardStatusNeedsRefund(from: RewardStatus, to: RewardStatus) {
  return to === "rejected" && from !== "rejected";
}
