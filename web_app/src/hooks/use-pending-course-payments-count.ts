"use client";

import { useCallback, useEffect, useState } from "react";
import { COURSE_PAYMENTS_CHANGED_EVENT, coursePaymentsApi } from "@/lib/course-payments-api";

/** The number of course payments waiting for a decision: the badge on the menu. */
export function usePendingCoursePaymentsCount(pollMs = 60_000, enabled = true) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setCount(null);
      return;
    }
    try {
      const result = await coursePaymentsApi.pendingCount();
      setCount(result.count);
    } catch {
      setCount(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    const onChanged = () => void reload();
    window.addEventListener(COURSE_PAYMENTS_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(COURSE_PAYMENTS_CHANGED_EVENT, onChanged);
    };
  }, [enabled, pollMs, reload]);

  return { count, reload };
}
