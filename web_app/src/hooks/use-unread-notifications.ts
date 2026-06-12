"use client";

import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "@/lib/notifications-api";

export function useUnreadNotifications(pollMs = 60_000) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await notificationsApi.unreadCount();
      setCount(result.count);
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
