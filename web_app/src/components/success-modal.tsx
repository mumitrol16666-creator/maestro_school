"use client";

import { CheckCircle2, X } from "lucide-react";

export function SuccessModal({
  open,
  title,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={24} />
          </span>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="text-stone-400">
            <X size={20} />
          </button>
        </div>
        <h3 className="font-display mt-5 text-3xl">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
