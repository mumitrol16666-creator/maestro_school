import type { ApiNewsPost } from "./api";
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
    /** Plan 3.1: what is to pay now, from CRM. */
    amountDueKzt: number;
    membership: FamilyMembership | null;
    otherMemberships: FamilyMembership[];
  } | null;
  upcomingLessons: FamilySchoolLesson[];
  visits: FamilyVisit[];
  results: FamilyResults | null;
  crmUnavailable: boolean;
  crmStale: boolean;
  crmSnapshotAt: string | null;
};

/** Plan 3.1: a membership as the parent reads it. Prices and payments stay in CRM. */
export type FamilyMembership = {
  id: string | null;
  title: string;
  directionName: string | null;
  groupName: string | null;
  perLesson: boolean;
  classesRemaining: number | null;
  totalClasses: number | null;
  validUntil: string | null;
  amountToPayKzt: number;
};

/** Plan 3.2: a past lesson — came or not; topic and summary once the school confirmed it. */
export type FamilyVisit = {
  crmClassId: string | null;
  title: string | null;
  date: string | null;
  startTime: string | null;
  groupName: string | null;
  teacherName: string | null;
  attendance: "present" | "late" | "excused" | "absent" | "unmarked" | "pending";
  confirmed: boolean;
  topic: string | null;
  summary: string | null;
};

/** Plan 3.3: the month's results. */
export type FamilyResults = {
  month: string;
  topics: Array<{ id: string; title: string; direction: string; group: boolean; masteredAt: string }>;
  sectors: Array<{
    planId: string;
    scope: "student" | "group";
    sequence: number;
    direction: string;
    at: string;
    how: "exam" | "teacher" | "completed";
    certificate: string | null;
  }>;
  level: { title: string; level: number; nextTitle: string | null; progressPercent: number; reachedThisMonth: boolean } | null;
};

export type FamilyNewsPost = ApiNewsPost;
