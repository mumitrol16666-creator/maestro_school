"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  getSchoolAlertCounts,
  SCHOOL_ALERTS_UPDATED_EVENT,
  type SchoolAlertCounts,
} from "@/lib/student-school-alerts";
import type { StudentOfflineSummary } from "@/types/school-offline";

const emptyCounts: SchoolAlertCounts = {
  homework: 0,
  reports: 0,
  totalUnread: 0,
  todayLessons: 0,
  tomorrowLessons: 0,
};

export function useStudentSchoolAlerts(userId?: string, pollMs = 60_000) {
  const [data, setData] = useState<StudentOfflineSummary | null>(null);
  const [counts, setCounts] = useState<SchoolAlertCounts>(emptyCounts);

  const recalculate = useCallback((summary: StudentOfflineSummary | null) => {
    if (!userId || !summary) {
      setCounts(emptyCounts);
      return;
    }
    setCounts(getSchoolAlertCounts(userId, summary));
  }, [userId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const summary = await api.studentOfflineSummary();
      setData(summary);
      recalculate(summary);
    } catch {
      setData(null);
      setCounts(emptyCounts);
    }
  }, [recalculate, userId]);

  useEffect(() => {
    if (!userId) return;
    void reload();
    const timer = window.setInterval(() => void reload(), pollMs);
    return () => window.clearInterval(timer);
  }, [pollMs, reload, userId]);

  useEffect(() => {
    const update = () => recalculate(data);
    window.addEventListener(SCHOOL_ALERTS_UPDATED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SCHOOL_ALERTS_UPDATED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [data, recalculate]);

  return { data, counts, reload };
}

