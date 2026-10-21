"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { GroupMonthlyPlanEditor } from "@/components/group-monthly-plan-editor";
import { StudentMonthlyPlanEditor } from "@/components/student-monthly-plan-editor";

/**
 * Plan 1.14: the sector editor over the lesson — the teacher opens and publishes a sector (from a
 * step template or empty) without leaving the lesson; closing the panel reloads the lesson topics.
 */
export function LessonSectorDrawer({
  target,
  onClose,
}: {
  target:
    | { kind: "student"; crmStudentId: string; directionTitles: string[] }
    | { kind: "group"; crmGroupId: string; directionTitle: string }
    | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Сектор ученика"
        data-testid="lesson-sector-drawer"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-3xl flex-col bg-paper shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-gold-ink">Сектор из урока</p>
            <p className="text-xs text-stone-500">Опубликуйте сектор и закройте панель — темы появятся на шаге урока.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть сектор" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {target.kind === "student" ? (
            <StudentMonthlyPlanEditor crmStudentId={target.crmStudentId} directionTitles={target.directionTitles} />
          ) : (
            <GroupMonthlyPlanEditor crmGroupId={target.crmGroupId} directionTitle={target.directionTitle} />
          )}
        </div>
      </aside>
    </div>
  );
}
