import { api, ApiError, getStoredUser, isAnswerFromMemory } from "@/lib/api-client";
import { reportApiUnreachable, reportSchoolFreshness, reportSchoolReachable, reportSchoolUnavailable } from "@/lib/connection-status";
import { readHomeSnapshot, saveHomeSnapshot } from "@/lib/offline-snapshot";
import type { ApiStudentHome } from "@/types/api";

/**
 * Plan 2.1: one read of `/students/me/home` serves «Сейчас», «Обучение» and the header badges.
 * Pages and the shell asking within a few seconds share one request; a failed read is not kept.
 */
const HOME_TTL_MS = 20_000;
let cached: { at: number; userId: string | null; promise: Promise<ApiStudentHome> } | null = null;

/** The moment the saved home describes: when it was saved, or the server's older CRM copy inside it. */
function savedHomeTime(savedAt: number, home: ApiStudentHome) {
  const crmAt = home.school?.crmStale && home.school.crmSnapshotAt ? Date.parse(home.school.crmSnapshotAt) : Number.NaN;
  return Number.isFinite(crmAt) ? Math.min(savedAt, crmAt) : savedAt;
}

export function loadStudentHome(options: { fresh?: boolean } = {}) {
  const userId = getStoredUser()?.id ?? null;
  // A home read for another student on this device (sign-out, sign-in) is never reused.
  if (!options.fresh && cached && cached.userId === userId && Date.now() - cached.at < HOME_TTL_MS) return cached.promise;
  const promise: Promise<ApiStudentHome> = api.studentHome().then(
    (home) => {
      // В-18: the last live home is kept on the device for opening the app without network.
      if (userId && !isAnswerFromMemory(home)) saveHomeSnapshot(userId, home);
      // The shell tells the student when the schedule is the server's last copy from CRM,
      // or that CRM is down with no copy at all (a student the school has not linked sees nothing).
      if (home.schoolStatus === "unavailable") reportSchoolUnavailable();
      else if (home.school) reportSchoolFreshness(home.school);
      else if (home.schoolStatus) reportSchoolReachable();
      return home;
    },
    (reason: unknown) => {
      if (cached?.promise === promise) cached = null;
      // Decision of 02.11: without network the saved home is shown if it is younger than 12 hours.
      const saved = reason instanceof ApiError && reason.code === "NETWORK_ERROR" && userId
        ? readHomeSnapshot<ApiStudentHome>(userId)
        : null;
      if (!saved) throw reason;
      reportApiUnreachable({ servedSavedAt: savedHomeTime(saved.savedAt, saved.home) });
      return saved.home;
    },
  );
  cached = { at: Date.now(), userId, promise };
  return promise;
}

/** After the student changes something (an answer, a proposal), the next read is fresh. */
export function invalidateStudentHome() {
  cached = null;
}
