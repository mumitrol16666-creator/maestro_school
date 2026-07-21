"use client";

import { useCallback, useEffect, useState } from "react";
import { onlineLessonsApi } from "@/lib/online-lessons-api";

export function usePendingOnlineLessonsCount(pollMs = 60_000, isTeacher = false) {
  const [counts, setCounts] = useState<{ newRequests: number; myInWork: number; assignedOrScheduled: number; submissions: number } | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await onlineLessonsApi.pendingCount();
      setCounts(result);
    } catch {
      setCounts(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, reload]);

  const count = counts
    ? counts.newRequests + (isTeacher ? counts.myInWork : counts.assignedOrScheduled)
    : null;

  return { count, counts, reload };
}
