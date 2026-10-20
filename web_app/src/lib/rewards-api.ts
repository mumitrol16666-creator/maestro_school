import { apiRequest } from "./api-client";
import type {
  AdminRewardsOverview,
  RewardCatalogInput,
  RewardCatalogItem,
  RewardRedemption,
  RewardRedemptionStatus,
  StudentRewardsOverview,
} from "@/types/rewards";

export const rewardsApi = {
  studentOverview: () =>
    apiRequest<StudentRewardsOverview>("/students/me/rewards"),
  adminOverview: (status?: RewardRedemptionStatus) =>
    apiRequest<AdminRewardsOverview>(
      `/admin/rewards${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  create: (body: RewardCatalogInput) =>
    apiRequest<RewardCatalogItem>("/admin/rewards", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (rewardId: string, body: Partial<RewardCatalogInput>) =>
    apiRequest<RewardCatalogItem>(`/admin/rewards/${encodeURIComponent(rewardId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  process: (
    redemptionId: string,
    status: Exclude<RewardRedemptionStatus, "requested">,
    adminComment?: string,
  ) =>
    apiRequest<RewardRedemption>(
      `/admin/reward-redemptions/${encodeURIComponent(redemptionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, adminComment: adminComment?.trim() || null }),
      },
    ),
};
