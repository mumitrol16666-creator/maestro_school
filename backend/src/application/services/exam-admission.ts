import { ConflictError } from "../../domain/errors.js";

type ExamPlan = { crmStudentId:string|null; crmGroupId:string|null; status:string; publishedVersionNumber:number|null; examReadyAt?:Date|null };

/** The same admission rule for individual pupils, quartet members and retakes. */
export function assertPersonalExamPlan<T extends ExamPlan>(plan:T, crmStudentId?:string): asserts plan is T & {crmStudentId:string;crmGroupId:null} {
  if (!plan.crmStudentId || plan.crmGroupId || (crmStudentId && plan.crmStudentId!==crmStudentId)) {
    throw new ConflictError("Для экзамена нужен личный сектор ученика", "EXAM_PERSONAL_SECTOR_REQUIRED");
  }
  if (plan.status==="closed") throw new ConflictError("Сектор уже закрыт", "SECTOR_ALREADY_CLOSED");
  if (plan.publishedVersionNumber===null) throw new ConflictError("Сначала опубликуйте личный сектор ученика", "SECTOR_NOT_PUBLISHED");
}

export function assertExamReadiness(plan:ExamPlan,crmStudentId:string) {
  assertPersonalExamPlan(plan,crmStudentId);
  if (!plan.examReadyAt) throw new ConflictError("Преподаватель ещё не отметил готовность ученика к экзамену", "SECTOR_EXAM_NOT_READY");
}
