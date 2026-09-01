"use client";

import { useCallback, useEffect, useState } from "react";
import { notificationsApi, type UserNotificationType } from "@/lib/notifications-api";

export function useUnreadNotifications(
  pollMs = 30_000,
  type?: UserNotificationType,
) {
  const [count, setCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await notificationsApi.unreadCount(type);
      setCount(result.count);
    } catch {
      setCount(null);
    }
  }, [type]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    const handleNotificationsChanged = () => void reload();
    const handleFocus = () => void reload();
    const handleVisibilityChange = () => {
      if (!document.hidden) void reload();
    };
    window.addEventListener("maestro:notifications-changed", handleNotificationsChanged);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("maestro:notifications-changed", handleNotificationsChanged);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollMs, reload]);

  return { count, reload };
}
