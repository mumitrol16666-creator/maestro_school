import type { SchoolOfflineLesson, StudentOfflineSummary } from "./school-offline";

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
  summary: FamilySchoolSummary;
};

export type FamilySchoolLesson = Omit<SchoolOfflineLesson, "materials">;

export type FamilySchoolSummary = {
  profile: Omit<StudentOfflineSummary["profile"], "phone">;
  balanceSnapshot: StudentOfflineSummary["balanceSnapshot"];
  upcomingLessons: FamilySchoolLesson[];
  lessonHistory: FamilySchoolLesson[];
  monthlyPlan: StudentOfflineSummary["monthlyPlan"];
};
