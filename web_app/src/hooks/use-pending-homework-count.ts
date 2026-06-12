"use client";

import { useCallback, useEffect, useState } from "react";
import { homeworkReviewApi } from "@/lib/homework-review-api";

export function usePendingHomeworkCount(pollMs = 60_000) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await homeworkReviewApi.list({ status: "submitted", page: 1, limit: 1 });
      setCount(result.meta?.total ?? 0);
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
