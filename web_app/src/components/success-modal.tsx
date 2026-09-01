"use client";

import { CheckCircle2, X } from "lucide-react";
import { useId } from "react";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";

export function SuccessModal({
  open,
  title,
  description,
  onClose,
  confirmLabel = "Готово",
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  confirmLabel?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogBehavior(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Закрыть сообщение по фону"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md overscroll-contain rounded-t-xl border border-stone-200 bg-paper px-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 shadow-2xl sm:rounded-xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={24} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            <X size={20} />
          </button>
        </div>
        <h2 id={titleId} className="font-display mt-5 text-3xl">{title}</h2>
        <p id={descriptionId} className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
        <button
          type="button"
          onClick={onClose}
          data-dialog-initial-focus="true"
          className="mt-6 min-h-12 w-full rounded-lg bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {confirmLabel}
        </button>
      </section>
    </div>
  );
}
