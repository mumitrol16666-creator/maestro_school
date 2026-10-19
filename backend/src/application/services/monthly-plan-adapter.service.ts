import { productFeatureConfig } from "../../config/product-features.js";
import { BadRequestError } from "../../domain/errors.js";
import type { MonthlyPlanItem } from "../../domain/monthly-plan.js";
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
 * The routes still speak of a «monthly plan»; behind them is the sector
 * (learning_plans). The month-bound JSON plans were archived on 19.10
 * (schema legacy_archive), so with learning topics switched off there is
 * no plan to read or write any more. `month` is accepted and ignored.
 */
export function learningTopicsV2Enabled() {
  return productFeatureConfig.flags.learningTopicsV2;
}

function requireSectors() {
  if (!learningTopicsV2Enabled()) {
    throw new BadRequestError(
      "Учебные секторы выключены на этом сервере",
      "LEARNING_TOPICS_V2_DISABLED",
    );
  }
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

type PlanFields = {
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
};

type AdapterPlanInput = PlanFields
  & Partial<Pick<LearningPlanV2Input, "expectedVersion" | "templateStepId" | "preparedTestId">>
  & { items: Array<MonthlyPlanItem & { masteryCriteria?: string }> };

type AdapterGroupPlanInput = AdapterPlanInput & {
  materials: Array<{ id: string; title: string; url: string; note: string }>;
};

export async function getStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  _month: string | undefined,
  crmDirectionId?: string,
) {
  requireSectors();
  return getStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId));
}

export async function saveStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  _month: string | undefined,
  input: AdapterPlanInput,
  crmDirectionId?: string,
) {
  requireSectors();
  return saveStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId), input);
}

export async function publishStudentMonthlyPlanAdapted(
  teacherUserId: string,
  crmStudentId: string,
  _month: string | undefined,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  requireSectors();
  return publishStudentLearningPlanV2(teacherUserId, crmStudentId, requiredCrmDirectionId(crmDirectionId), expectedVersion);
}

export async function getGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  _month: string | undefined,
  crmDirectionId?: string,
) {
  requireSectors();
  return getGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId));
}

export async function saveGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  _month: string | undefined,
  input: AdapterGroupPlanInput,
  crmDirectionId?: string,
) {
  requireSectors();
  return saveGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId), input);
}

export async function publishGroupMonthlyPlanAdapted(
  teacherUserId: string,
  crmGroupId: string,
  _month: string | undefined,
  expectedVersion?: number,
  crmDirectionId?: string,
) {
  requireSectors();
  return publishGroupLearningPlanV2(teacherUserId, crmGroupId, requiredCrmDirectionId(crmDirectionId), expectedVersion);
}

/** Published sectors of a student and their groups; empty when sectors are off. */
export async function listPublishedMonthlyPlansAdapted(
  crmStudentId: string,
  crmGroupIds: readonly string[],
  _month: string | undefined,
  options: { includeClosed?: boolean } = {},
) {
  if (!learningTopicsV2Enabled()) return [];
  return listPublishedLearningPlansV2(crmStudentId, crmGroupIds, options);
}
