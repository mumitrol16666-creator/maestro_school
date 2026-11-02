/**
 * В-18, decision of 02.11: without network the student app may show saved data that is
 * younger than 12 hours, always under the «Нет связи» strip. Only the home answer is written
 * to the device, one copy per student, and every copy is erased when anyone signs out.
 */
export const SAVED_ANSWER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const HOME_SNAPSHOT_PREFIX = "maestro_home_snapshot:";

type HomeSnapshot<T> = { savedAt: number; home: T };

export function isFreshSavedAnswer(savedAt: number, now = Date.now()) {
  return now - savedAt >= 0 && now - savedAt < SAVED_ANSWER_MAX_AGE_MS;
}

export function saveHomeSnapshot<T>(userId: string, home: T) {
  try {
    const snapshot: HomeSnapshot<T> = { savedAt: Date.now(), home };
    window.localStorage.setItem(`${HOME_SNAPSHOT_PREFIX}${userId}`, JSON.stringify(snapshot));
  } catch {
    // A full or blocked storage only means no saved home next time.
  }
}

export function readHomeSnapshot<T>(userId: string): HomeSnapshot<T> | null {
  try {
    const raw = window.localStorage.getItem(`${HOME_SNAPSHOT_PREFIX}${userId}`);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as HomeSnapshot<T>;
    if (typeof snapshot?.savedAt !== "number" || !snapshot.home) return null;
    return isFreshSavedAnswer(snapshot.savedAt) ? snapshot : null;
  } catch {
    return null;
  }
}

export function clearHomeSnapshots() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(HOME_SNAPSHOT_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing to erase when the storage is unavailable.
  }
}
