import { api, ApiError } from "@/lib/api-client";
import { isCrmUnavailableCode, reportSchoolFreshness, reportSchoolUnavailable } from "@/lib/connection-status";

/**
 * В-18: every student screen that reads the school schedule goes through here, so the shell
 * knows whether the schedule is live, the server's last copy, or not readable at all.
 */
export async function loadStudentOfflineSummary() {
  try {
    const summary = await api.studentOfflineSummary();
    reportSchoolFreshness(summary);
    return summary;
  } catch (reason) {
    if (reason instanceof ApiError && isCrmUnavailableCode(reason.code)) reportSchoolUnavailable();
    throw reason;
  }
}
