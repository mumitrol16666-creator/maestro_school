import { api } from "@/lib/api-client";
import type { ApiStudentHome } from "@/types/api";

/**
 * Plan 2.1: one read of `/students/me/home` serves «Сейчас», «Обучение» and the header badges.
 * Pages and the shell asking within a few seconds share one request; a failed read is not kept.
 */
const HOME_TTL_MS = 20_000;
let cached: { at: number; promise: Promise<ApiStudentHome> } | null = null;

export function loadStudentHome(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cached && Date.now() - cached.at < HOME_TTL_MS) return cached.promise;
  const promise = api.studentHome();
  cached = { at: Date.now(), promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

/** After the student changes something (an answer, a proposal), the next read is fresh. */
export function invalidateStudentHome() {
  cached = null;
}
