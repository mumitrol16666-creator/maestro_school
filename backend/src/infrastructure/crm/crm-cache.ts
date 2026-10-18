import { AppError } from "../../domain/errors.js";

type Entry<T> = { value: T; fetchedAt: number };

export type CachedRead<T> = {
  value: T;
  /** The value came from an earlier successful read because CRM is unreachable now. */
  stale: boolean;
  fetchedAt: Date;
};

/**
 * Small in-process cache for CRM reads with two windows: `maxAgeMs` serves the
 * value without a request, `staleMaxAgeMs` serves the last good value when the
 * request fails with a transport error (502/504). Any other CRM answer (401, 404,
 * validation) is returned as is and drops the cached entry.
 */
export function createCrmReadCache<T>(options: { maxAgeMs: number; staleMaxAgeMs: number }) {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function isTransportFailure(error: unknown) {
    return error instanceof AppError && error.statusCode >= 500;
  }

  async function read(
    key: string,
    loader: () => Promise<T>,
    readOptions: { fresh?: boolean; now?: number } = {},
  ): Promise<CachedRead<T>> {
    const now = readOptions.now ?? Date.now();
    const cached = entries.get(key);
    if (!readOptions.fresh && cached && now - cached.fetchedAt < options.maxAgeMs) {
      return { value: cached.value, stale: false, fetchedAt: new Date(cached.fetchedAt) };
    }
    let pending = inflight.get(key);
    if (!pending) {
      pending = loader();
      inflight.set(key, pending);
      const settled = () => {
        if (inflight.get(key) === pending) inflight.delete(key);
      };
      // Both branches are handled here; the caller below observes the rejection.
      pending.then(settled, settled);
    }
    try {
      const value = await pending;
      entries.set(key, { value, fetchedAt: now });
      return { value, stale: false, fetchedAt: new Date(now) };
    } catch (error) {
      if (isTransportFailure(error) && cached && now - cached.fetchedAt < options.staleMaxAgeMs) {
        return { value: cached.value, stale: true, fetchedAt: new Date(cached.fetchedAt) };
      }
      if (!isTransportFailure(error)) entries.delete(key);
      throw error;
    }
  }

  return {
    read,
    invalidate(key: string) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

export function cacheWindowFromEnv(name: string, fallbackMs: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallbackMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number of milliseconds`);
  }
  return parsed;
}
