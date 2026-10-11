import { ConflictError } from "./errors.js";

export const CRM_APPROVAL_REQUIRED = "CRM_APPROVAL_REQUIRED";
export function requireCrmLessonApproval(): never {
  throw new ConflictError("Подтверждение урока и списание выполняются только в CRM.", CRM_APPROVAL_REQUIRED);
}

export function requireCrmLessonReopen(): never {
  throw new ConflictError("Пересмотр урока и возврат списания выполняются только в CRM.", "CRM_REOPEN_REQUIRED");
}
