"use client";

import { AlertTriangle, Check, ChevronRight, LoaderCircle, X, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { primaryButton, secondaryButton } from "./admin-ui";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const saveStateContent: Record<SaveState, { label: string; className: string; icon: ReactNode }> = {
  idle: { label: "Без изменений", className: "bg-stone-100 text-stone-500", icon: <Check size={14} /> },
  dirty: { label: "Есть несохранённые изменения", className: "bg-amber-50 text-amber-800", icon: <AlertTriangle size={14} /> },
  saving: { label: "Сохранение...", className: "bg-blue-50 text-blue-700", icon: <LoaderCircle className="animate-spin" size={14} /> },
  saved: { label: "Сохранено", className: "bg-emerald-50 text-emerald-700", icon: <Check size={14} /> },
  error: { label: "Ошибка сохранения", className: "bg-red-50 text-red-700", icon: <XCircle size={14} /> },
};

export function SaveStatus({ state }: { state: SaveState }) {
  const content = saveStateContent[state];
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${content.className}`}>{content.icon}{content.label}</span>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return <nav aria-label="Навигация" className="mb-6 flex flex-wrap items-center gap-1 text-sm font-semibold text-stone-400">
    {items.map((item, index) => <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
      {index > 0 && <ChevronRight size={14} />}
      {item.href ? <Link href={item.href} className="hover:text-ink">{item.label}</Link> : <span className="text-ink">{item.label}</span>}
    </span>)}
  </nav>;
}

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({ request, busy, onClose }: { request: ConfirmRequest | null; busy: boolean; onClose: () => void }) {
  if (!request) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/35 p-5 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-[28px] border border-stone-200 bg-paper p-6 shadow-2xl">
      <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-700"><AlertTriangle size={19} /></span><div className="min-w-0 flex-1"><h2 id="confirm-title" className="font-display text-3xl">{request.title}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{request.description}</p></div><button disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={18} /></button></div>
      <div className="mt-7 flex justify-end gap-3"><button disabled={busy} onClick={onClose} className={secondaryButton}>Отмена</button><button disabled={busy} onClick={() => void request.onConfirm()} className={`${primaryButton} bg-red-700`}>{busy && <LoaderCircle className="animate-spin" size={15} />}{request.confirmLabel ?? "Удалить"}</button></div>
    </div>
  </div>;
}
