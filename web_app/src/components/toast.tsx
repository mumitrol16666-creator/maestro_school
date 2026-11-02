"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * В-22: one short confirmation above the bottom navigation after a save or a send.
 * The store lives outside React so any handler can call `toast.success(...)`; only the
 * student shell renders the viewport, so a shared form used elsewhere stays silent there.
 */
type ToastTone = "success" | "error";
type ToastItem = { id: number; tone: ToastTone; text: string };

const TOAST_DURATION_MS = 3_000;
let current: ToastItem | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id?: number) {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  if (timer) clearTimeout(timer);
  timer = null;
  emit();
}

function show(tone: ToastTone, text: string) {
  if (timer) clearTimeout(timer);
  const item = { id: nextId++, tone, text };
  current = item;
  timer = setTimeout(() => dismiss(item.id), TOAST_DURATION_MS);
  emit();
}

export const toast = {
  success: (text: string) => show("success", text),
  error: (text: string) => show("error", text),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ToastViewport() {
  const item = useSyncExternalStore(subscribe, () => current, () => null);
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[70] flex justify-center lg:bottom-6 print:hidden"
      aria-live="polite"
      role="status"
    >
      {item ? (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          data-testid="app-toast"
          data-tone={item.tone}
          className="maestro-toast pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-xl bg-charcoal px-4 py-3 text-left text-sm font-semibold text-white shadow-2xl"
        >
          {item.tone === "success"
            ? <CheckCircle2 size={20} className="shrink-0 text-emerald-400" aria-hidden="true" />
            : <XCircle size={20} className="shrink-0 text-red-400" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{item.text}</span>
        </button>
      ) : null}
    </div>
  );
}
