import { api, ApiError, isAnswerFromMemory } from "@/lib/api-client";
import { isCrmUnavailableCode, reportSchoolFreshness, reportSchoolUnavailable } from "@/lib/connection-status";

/**
 * В-18: every student screen that reads the school schedule goes through here, so the shell
 * knows whether the schedule is live, the server's last copy, or not readable at all.
 * `live`: a refresh the student asked for — an answer kept in memory does not count as one, and a
 * CRM failure is reported by the screen itself, which still shows the schedule it had.
 */
export async function loadStudentOfflineSummary(options: { live?: boolean } = {}) {
  try {
    const summary = await api.studentOfflineSummary();
    if (options.live && isAnswerFromMemory(summary)) {
      throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
    }
    reportSchoolFreshness(summary);
    return summary;
  } catch (reason) {
    if (!options.live && reason instanceof ApiError && isCrmUnavailableCode(reason.code)) reportSchoolUnavailable();
    throw reason;
  }
}
