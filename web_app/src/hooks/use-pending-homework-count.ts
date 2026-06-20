"use client";

import { useCallback, useEffect, useState } from "react";
import { homeworkReviewApi } from "@/lib/homework-review-api";

export function usePendingHomeworkCount(pollMs = 60_000, enabled = true) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setCount(null);
      return;
    }
    try {
      const result = await homeworkReviewApi.list({ status: "submitted", page: 1, limit: 1 });
      setCount(result.meta?.total ?? 0);
    } catch {
      setCount(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, reload]);

  return { count, reload };
}
