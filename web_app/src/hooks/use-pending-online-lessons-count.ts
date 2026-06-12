"use client";

import { useCallback, useEffect, useState } from "react";
import { onlineLessonsApi } from "@/lib/online-lessons-api";

export function usePendingOnlineLessonsCount(pollMs = 60_000) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await onlineLessonsApi.pendingCount();
      setCount(result.requests + result.submissions);
    } catch {
      setCount(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, reload]);

  return { count, reload };
}
