import type { StudentRankOverview } from "./api";

export type RewardRedemptionStatus = "requested" | "approved" | "fulfilled" | "rejected";

export interface RewardCatalogItem {
  id: string;
  title: string;
  description: string;
  category: string;
  costCoins: number;
  stock: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { redemptions: number };
}

export interface RewardRedemption {
  id: string;
  studentId: string;
  rewardId: string;
  rewardTitle: string;
  costCoins: number;
  status: RewardRedemptionStatus;
  studentNote: string | null;
  adminComment: string | null;
  processedAt: string | null;
  createdAt: string;
  reward: RewardCatalogItem;
  student?: {
    id: string;
    login: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
  processedBy?: {
    id?: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface StudentRewardsOverview {
  points: number;
  coins: number;
  rank: StudentRankOverview;
  catalog: RewardCatalogItem[];
  redemptions: RewardRedemption[];
}

export interface AdminRewardsOverview {
  catalog: RewardCatalogItem[];
  redemptions: RewardRedemption[];
}

export interface RewardCatalogInput {
  title: string;
  description: string;
  category: string;
  costCoins: number;
  stock?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}
