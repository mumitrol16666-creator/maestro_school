"use client";

import { useCallback, useEffect, useState } from "react";
import { lessonQuestionsApi } from "@/lib/lesson-questions-api";

export function usePendingLessonQuestionsCount(pollMs = 60_000, enabled = true) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setCount(null);
      return;
    }
    try {
      const result = await lessonQuestionsApi.pendingCount();
      setCount(result.count);
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
