"use client";

import { useCallback, useEffect, useState } from "react";
import { messagesApi } from "@/lib/messages-api";

export function useMessageMailboxStatus(enabled = true, pollMs = 30_000) {
  const [count, setCount] = useState<number | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  const reloadCount = useCallback(async () => {
    if (!enabled) {
      setCount(null);
      return;
    }
    try {
      setCount((await messagesApi.unreadCount()).count);
    } catch {
      setCount(null);
    }
  }, [enabled]);

  const reloadAccess = useCallback(async () => {
    if (!enabled) {
      setHasAccess(false);
      return;
    }
    try {
      setHasAccess((await messagesApi.contacts()).length > 0);
    } catch {
      setHasAccess(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reloadCount();
    void reloadAccess();
    const timer = window.setInterval(() => void reloadCount(), pollMs);
    const handleUpdate = () => {
      void reloadCount();
      void reloadAccess();
    };
    window.addEventListener("maestro:messages-updated", handleUpdate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("maestro:messages-updated", handleUpdate);
    };
  }, [pollMs, reloadAccess, reloadCount]);

  return { count, hasAccess, reloadCount, reloadAccess };
}
