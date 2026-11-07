"use client";

import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";
import { inputClass, primaryButton, secondaryButton } from "./admin-ui";

export interface PaymentDialogField {
  label: string;
  placeholder?: string;
  /** The least number of characters; 0 means the note is optional. */
  minLength: number;
  maxLength?: number;
  hint?: string;
}

export interface PaymentDialogRequest {
  title: string;
  description: string;
  /** A line that must not be missed, for example «доступ закроется сразу». */
  warning?: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  field?: PaymentDialogField;
  /** Other inputs, for example the course and the date of an access; their values live in the dialog. */
  extra?: {
    initial: Record<string, string>;
    render: (values: Record<string, string>, set: (key: string, value: string) => void) => React.ReactNode;
    /** An error line when the values cannot be sent yet; null when they can. */
    problem?: (values: Record<string, string>) => string | null;
  };
  /** Resolves when done; throws to keep the dialog open with the message. */
  onConfirm: (text: string, values: Record<string, string>) => Promise<void>;
}

/**
 * One dialog for the decisions on money and access: it explains the effect, asks for the
 * reason when one is needed, and keeps itself open with the server's message when the action fails.
 */
export function PaymentActionDialog({ request, onClose }: { request: PaymentDialogRequest | null; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const [text, setText] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialogBehavior(Boolean(request), onClose, { canClose: !busy });

  useEffect(() => {
    setText("");
    setValues(request?.extra?.initial ?? {});
    setError(null);
    setBusy(false);
  }, [request]);

  if (!request) return null;
  const field = request.field;
  const trimmed = text.trim();
  const tooShort = Boolean(field && field.minLength > 0 && trimmed.length < field.minLength);
  const extraProblem = request.extra?.problem?.(values) ?? null;

  async function submit() {
    if (!request || busy || tooShort || extraProblem) return;
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm(trimmed, values);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" data-testid="payment-dialog">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
        onClick={() => { if (!busy) onClose(); }}
        aria-label="Закрыть окно"
        tabIndex={-1}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-xl border border-stone-200 bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 shadow-2xl sm:rounded-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display min-w-0 text-2xl leading-tight sm:text-3xl">{request.title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:text-ink disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-stone-600">{request.description}</p>
        {request.warning ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-5 text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{request.warning}</span>
          </p>
        ) : null}
        {request.extra ? <div className="mt-4 space-y-4">{request.extra.render(values, (key, value) => setValues((current) => ({ ...current, [key]: value })))}</div> : null}
        {extraProblem ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{extraProblem}</p> : null}
        {field ? (
          <label htmlFor={fieldId} className="mt-4 block text-sm font-bold text-stone-700">
            {field.label}
            <textarea
              id={fieldId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={field.maxLength ?? 1000}
              rows={3}
              placeholder={field.placeholder}
              data-dialog-initial-focus="true"
              className={`${inputClass} mt-2 min-h-24 font-normal`}
            />
            {field.hint ? <span className="mt-1 block text-xs font-normal text-stone-500">{field.hint}</span> : null}
          </label>
        ) : null}
        {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Отмена</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || tooShort || Boolean(extraProblem)}
            data-dialog-initial-focus={field ? undefined : "true"}
            className={`${primaryButton} ${request.tone === "danger" ? "!border-red-700 !bg-red-700 !text-white hover:!bg-red-800" : ""}`}
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
