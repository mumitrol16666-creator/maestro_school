import { ConflictError } from "./errors.js";

export function buildArchivedLogin(userId: string): string {
  return `archived_${userId}`.slice(0, 64);
}

export function isStudentAccessFullyArchived(input: {
  userId: string;
  login: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  phoneNormalized: string | null;
  crmStudentId: string | null;
}): boolean {
  return (
    Boolean(input.deletedAt) &&
    !input.isActive &&
    input.phoneNormalized === null &&
    input.crmStudentId === null &&
    input.login === buildArchivedLogin(input.userId)
  );
}

export function assertStudentAccessCanBeArchived(input: {
  actualCrmStudentId: string | null;
  requestedCrmStudentId: string;
  force: boolean;
}) {
  if (
    input.actualCrmStudentId &&
    input.actualCrmStudentId !== input.requestedCrmStudentId &&
    !input.force
  ) {
    throw new ConflictError(
      "Аккаунт связан с другой карточкой CRM. Проверьте ученика и подтвердите принудительное отключение.",
      "ACCOUNT_LINK_MISMATCH",
    );
  }
}
