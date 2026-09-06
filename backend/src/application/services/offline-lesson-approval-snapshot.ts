import { ConflictError } from "../../domain/errors.js";

export type OfflineLessonApprovalSnapshot = {
  reportVersion: number;
  createdByUserId: string;
  recipientCrmStudentIds: string[];
};

type ImmutableOfflineLessonReportVersion = {
  version: number;
  authorUserId: string;
  attendancePayload: unknown;
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Builds the assignment approval input exclusively from the submitted report version.
 * Current student checks are deliberately not consulted: they may have changed after
 * the teacher submitted the version that the administrator actually approved.
 */
export function buildOfflineLessonApprovalSnapshot(
  version: ImmutableOfflineLessonReportVersion,
): OfflineLessonApprovalSnapshot {
  if (
    !Number.isInteger(version.version)
    || version.version < 1
    || typeof version.authorUserId !== "string"
    || !version.authorUserId.trim()
    || !Array.isArray(version.attendancePayload)
  ) {
    throw new ConflictError(
      "Снимок посещаемости подтверждаемой версии повреждён.",
      "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_INVALID",
    );
  }

  const recipientCrmStudentIds = new Set<string>();
  for (const entry of version.attendancePayload) {
    if (!isJsonRecord(entry)) {
      throw new ConflictError(
        "Снимок посещаемости подтверждаемой версии повреждён.",
        "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_INVALID",
      );
    }
    const crmStudentId = typeof entry.crmStudentId === "string"
      ? entry.crmStudentId.trim()
      : "";
    if (!crmStudentId) {
      throw new ConflictError(
        "Снимок посещаемости подтверждаемой версии повреждён.",
        "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_INVALID",
      );
    }
    if (["present", "late"].includes(String(entry.attendanceStatus))) {
      recipientCrmStudentIds.add(crmStudentId);
    }
  }

  return {
    reportVersion: version.version,
    createdByUserId: version.authorUserId,
    recipientCrmStudentIds: [...recipientCrmStudentIds].sort(),
  };
}
