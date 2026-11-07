"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

export function NextLearningPlan({ kind, ownerId, planId, directionId, version, disabled, blockedReason, onOpened }: {
  kind: "students" | "groups";
  ownerId: string;
  planId: string;
  directionId: string;
  version: number;
  disabled?: boolean;
  /** 07.11: why the next sector cannot be opened now (the previous one still waits for its exam). */
  blockedReason?: string | null;
  onOpened: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = kind === "groups";
  async function open() {
    if (busy || disabled || blockedReason) return;
    if (!window.confirm(group
      ? "Завершить текущий план группы и открыть новый? Личные результаты учеников сохранятся."
      : "Открыть следующий сектор? Текущий останется на своей вкладке до экзамена.")) return;
    setBusy(true);
    setError(null);
    try {
      await teacherStudentsApi.openNextSector(kind, ownerId, planId, directionId, version);
      await onOpened();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось открыть следующий план");
    } finally { setBusy(false); }
  }
  return <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
    {group || !blockedReason ? <p className="text-sm text-stone-600">{group
      ? "Общий план — темы и материалы совместных занятий. Готовность каждого ученика к экзамену учитывается отдельно."
      : "Продолжайте обучение в следующем секторе, пока предыдущий ожидает экзамена. Одновременно открыты не больше двух секторов."}</p> : null}
    <button type="button" disabled={disabled || busy || Boolean(blockedReason)} onClick={() => void open()}
      className={`${group || !blockedReason ? "mt-3" : "mt-0"} inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-50`}>
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
      {group ? "Открыть следующий план" : "Открыть следующий сектор"}
    </button>
    {blockedReason ? <p className="mt-2 text-xs text-stone-600" data-testid="next-sector-blocked">{blockedReason}</p>
      : disabled ? <p className="mt-2 text-xs text-stone-500">Сначала сохраните и опубликуйте изменения текущего плана.</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
  </div>;
}
