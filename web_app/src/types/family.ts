import type { ApiNewsPost, StudentAchievementItem } from "./api";
import type { SchoolOfflineLesson, StudentOfflineSummary } from "./school-offline";

export type ParentVisibility = {
  showSchedule: boolean;
  showBalance: boolean;
  showPlanProgress: boolean;
  showAchievements: boolean;
};

export type ParentVisibilityRequest = {
  id: string;
  requested: ParentVisibility;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type ParentVisibilityWorkspace = {
  policy: ParentVisibility;
  pendingRequest: ParentVisibilityRequest | null;
  recentRequests: ParentVisibilityRequest[];
};

export type FamilyChild = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  fullName: string;
  avatar?: string | null;
  relationship: string;
};

export type FamilyChildOverview = {
  child: FamilyChild;
  visibility: ParentVisibility;
  summary: FamilySchoolSummary;
};

export type FamilySchoolLesson = Omit<SchoolOfflineLesson, "materials">;

export type FamilySchoolSummary = {
  profile: Omit<StudentOfflineSummary["profile"], "phone">;
  financialBalance: {
    signedAmountKzt: number;
    status: "debt" | "credit" | "settled";
    source: "crm";
  } | null;
  upcomingLessons: FamilySchoolLesson[];
  monthlyPlan: StudentOfflineSummary["monthlyPlan"];
  achievements: StudentAchievementItem[];
};

export type FamilyNewsPost = ApiNewsPost;
