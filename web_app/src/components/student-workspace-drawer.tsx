"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { StudentWorkspaceCard } from "@/components/student-workspace-card";

/**
 * The student card as a side panel over the lesson: the teacher checks the
 * sector, tests and homework of one student without leaving the report.
 */
export function StudentWorkspaceDrawer({
  crmStudentId,
  crmClassId,
  onClose,
}: {
  crmStudentId: string | null;
  crmClassId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!crmStudentId) return;
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
  }, [crmStudentId, onClose]);

  if (!crmStudentId) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Карточка ученика"
        data-testid="student-workspace-drawer"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col bg-paper shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-gold-ink">Ученик на уроке</p>
          <button type="button" onClick={onClose} aria-label="Закрыть карточку" className="grid h-10 w-10 place-items-center rounded-xl text-stone-500 hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <StudentWorkspaceCard key={crmStudentId} crmStudentId={crmStudentId} crmClassId={crmClassId} embedded />
        </div>
      </aside>
    </div>
  );
}
