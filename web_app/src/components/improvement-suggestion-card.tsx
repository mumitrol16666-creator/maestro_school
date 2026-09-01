"use client";

import { CheckCircle2, Lightbulb, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { improvementSuggestionsApi } from "@/lib/improvement-suggestions-api";

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ImprovementSuggestionCard() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, open]);

  function showForm() {
    setTitle("");
    setDetails("");
    setError(null);
    setSent(false);
    setIdempotencyKey(createIdempotencyKey());
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3 || details.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await improvementSuggestionsApi.submit({
        idempotencyKey,
        title: title.trim(),
        details: details.trim(),
        currentPath: window.location.pathname,
      });
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить предложение");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-gold">
            <Lightbulb size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl">Есть идея для Maestro?</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Расскажите, что можно сделать понятнее или удобнее.
            </p>
            <button
              type="button"
              onClick={showForm}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <Lightbulb size={17} aria-hidden="true" />
              Предложить улучшение
            </button>
          </div>
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
            onClick={() => {
              if (!busy) setOpen(false);
            }}
            aria-label="Закрыть окно"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="improvement-dialog-title"
            className="relative flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[86dvh] sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-5 sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Обратная связь</p>
                <h2 id="improvement-dialog-title" className="font-display mt-1 text-2xl sm:text-3xl">
                  Предложить улучшение
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500 hover:bg-stone-50 disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            {sent ? (
              <div className="overflow-y-auto px-5 py-8 text-center sm:px-7 sm:py-10">
                <CheckCircle2 size={42} className="mx-auto text-emerald-600" aria-hidden="true" />
                <h3 className="font-display mt-4 text-3xl">Спасибо за идею</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
                  Предложение отправлено. Команда Maestro увидит его и сможет взять в работу.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-6 min-h-11 rounded-xl bg-ink px-6 py-3 text-sm font-bold text-white"
                >
                  Готово
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                <p className="text-sm leading-6 text-stone-500">
                  Опишите идею своими словами. Мы сохраним её вместе с названием текущего раздела.
                </p>
                <label className="mt-5 block">
                  <span className="text-sm font-bold text-ink">Коротко</span>
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    placeholder="Например: упростить заполнение отчёта"
                    className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                  />
                </label>
                <label className="mt-4 block">
                  <span className="text-sm font-bold text-ink">Что стоит изменить</span>
                  <textarea
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    maxLength={3_000}
                    rows={6}
                    placeholder="Что сейчас неудобно и как, на ваш взгляд, это должно работать?"
                    className="mt-2 w-full resize-y rounded-xl border border-stone-300 bg-white px-4 py-3 text-base leading-6 outline-none focus:border-gold focus:ring-2 focus:ring-gold/15"
                  />
                </label>
                {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy || title.trim().length < 3 || details.trim().length < 10}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send size={17} aria-hidden="true" />
                  {busy ? "Отправляем…" : "Отправить предложение"}
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
