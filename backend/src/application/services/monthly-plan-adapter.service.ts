import { productFeatureConfig } from "../../config/product-features.js";
import { BadRequestError } from "../../domain/errors.js";
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

type AdapterPlanInput = MonthlyPlanInput & Partial<Pick<LearningPlanV2Input, "expectedVersion">> & {
  items: Array<MonthlyPlanInput["items"][number] & { masteryCriteria?: string }>;
};

type AdapterGroupPlanInput = GroupMonthlyPlanInput & Partial<Pick<LearningPlanV2Input, "expectedVersion">> & {
  items: Array<GroupMonthlyPlanInput["items"][number] & { masteryCriteria?: string }>;
};

export async function getStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return getStudentMonthlyPlan(teacherUserId, crmStudentId, month);
  }
  return getStudentLearningPlanV2(
    teacherUserId,
    crmStudentId,
    requiredCrmDirectionId(crmDirectionId),
    month,
  );
}

export async function saveStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  input: AdapterPlanInput,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return saveStudentMonthlyPlan(teacherUserId, crmStudentId, month, input);
  }
  return saveStudentLearningPlanV2(
    teacherUserId,
    crmStudentId,
    requiredCrmDirectionId(crmDirectionId),
    month,
    input,
  );
}

export async function publishStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  month: string,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return publishStudentMonthlyPlan(teacherUserId, crmStudentId, month, expectedVersion);
  }
  return publishStudentLearningPlanV2(
    teacherUserId,
    crmStudentId,
    requiredCrmDirectionId(crmDirectionId),
    month,
    expectedVersion,
  );
}

export async function getGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return getGroupMonthlyPlan(teacherUserId, crmGroupId, month);
  }
  return getGroupLearningPlanV2(
    teacherUserId,
    crmGroupId,
    requiredCrmDirectionId(crmDirectionId),
    month,
  );
}

export async function saveGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  input: AdapterGroupPlanInput,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return saveGroupMonthlyPlan(teacherUserId, crmGroupId, month, input);
  }
  return saveGroupLearningPlanV2(
    teacherUserId,
    crmGroupId,
    requiredCrmDirectionId(crmDirectionId),
    month,
    input,
  );
}

export async function publishGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  month: string,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  if (!learningTopicsV2Enabled()) {
    return publishGroupMonthlyPlan(teacherUserId, crmGroupId, month, expectedVersion);
  }
  return publishGroupLearningPlanV2(
    teacherUserId,
    crmGroupId,
    requiredCrmDirectionId(crmDirectionId),
    month,
    expectedVersion,
  );
}

export async function listPublishedMonthlyPlansAdapted(
  crmStudentId: string,
  crmGroupIds: readonly string[],
  month: string,
) {
  if (learningTopicsV2Enabled()) {
    return listPublishedLearningPlansV2(crmStudentId, crmGroupIds, month);
  }
  const [studentPlans, groupPlans] = await Promise.all([
    listPublishedStudentMonthlyPlans(crmStudentId, month),
    listPublishedGroupMonthlyPlans([...crmGroupIds], month),
  ]);
  return [...studentPlans, ...groupPlans];
}
