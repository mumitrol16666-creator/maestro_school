import { productFeatureConfig } from "../../config/product-features.js";
import { BadRequestError } from "../../domain/errors.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import {
  getGroupMonthlyPlan,
  listPublishedGroupMonthlyPlans,
  publishGroupMonthlyPlan,
  saveGroupMonthlyPlan,
  type GroupMonthlyPlanInput,
} from "./group-monthly-plan.service.js";
import {
  getStudentMonthlyPlan,
  listPublishedStudentMonthlyPlans,
  publishStudentMonthlyPlan,
  saveStudentMonthlyPlan,
  type MonthlyPlanInput,
} from "./student-monthly-plan.service.js";
import {
  getGroupLearningPlanV2,
  getStudentLearningPlanV2,
  listPublishedLearningPlansV2,
  publishGroupLearningPlanV2,
  publishStudentLearningPlanV2,
  saveGroupLearningPlanV2,
  saveStudentLearningPlanV2,
  type LearningPlanV2Input,
} from "./learning-plan-v2.service.js";

/**
 * Bridges the legacy month-bound JSON plans (flag off) and sectors (flag on).
 * With sectors `month` is ignored: there is one open sector per direction.
 */
export function learningTopicsV2Enabled() {
  return productFeatureConfig.flags.learningTopicsV2;
}

function requiredCrmDirectionId(crmDirectionId: string | undefined) {
  const value = crmDirectionId?.trim();
  if (!value) {
    throw new BadRequestError(
      "Выберите направление обучения",
      "CRM_DIRECTION_REQUIRED",
    );
  }
  return value;
}

function legacyMonth(month: string | undefined) {
  return month ?? aqtobeMonthKey();
}

type AdapterPlanInput = MonthlyPlanInput
  & Partial<Pick<LearningPlanV2Input, "expectedVersion" | "templateStepId" | "preparedTestId">>
  & { items: Array<MonthlyPlanInput["items"][number] & { masteryCriteria?: string }> };

type AdapterGroupPlanInput = GroupMonthlyPlanInput
  & Partial<Pick<LearningPlanV2Input, "expectedVersion" | "templateStepId" | "preparedTestId">>
  & { items: Array<GroupMonthlyPlanInput["items"][number] & { masteryCriteria?: string }> };

export async function getStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string | undefined,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return getStudentMonthlyPlan(teacherUserId, crmStudentId, legacyMonth(month));
  }
  return getStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId));
}

export async function saveStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string | undefined,
  input: AdapterPlanInput,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return saveStudentMonthlyPlan(teacherUserId, crmStudentId, legacyMonth(month), input);
  }
  return saveStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId), input);
}

export async function publishStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string | undefined,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return publishStudentMonthlyPlan(teacherUserId, crmStudentId, legacyMonth(month), expectedVersion);
  }
  return publishStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId), expectedVersion);
}

export async function getGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string | undefined,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return getGroupMonthlyPlan(teacherUserId, crmGroupId, legacyMonth(month));
  }
  return getGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId));
}

export async function saveGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string | undefined,
  input: AdapterGroupPlanInput,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return saveGroupMonthlyPlan(teacherUserId, crmGroupId, legacyMonth(month), input);
  }
  return saveGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId), input);
}

export async function publishGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string | undefined,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return publishGroupMonthlyPlan(teacherUserId, crmGroupId, legacyMonth(month), expectedVersion);
  }
  return publishGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId), expectedVersion);
}

export async function listPublishedMonthlyPlansAdapted(
  crmStudentId: string,
  crmGroupIds: readonly string[],
  month: string | undefined,
  options: { includeClosed?: boolean } = {},
) {
  if (learningTopicsV2Enabled()) {
    return listPublishedLearningPlansV2(crmStudentId, crmGroupIds, options);
  }
  const [studentPlans, groupPlans] = await Promise.all([
    listPublishedStudentMonthlyPlans(crmStudentId, legacyMonth(month)),
    listPublishedGroupMonthlyPlans([...crmGroupIds], legacyMonth(month)),
  ]);
  return [...studentPlans, ...groupPlans];
}
