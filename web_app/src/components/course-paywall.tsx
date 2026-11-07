"use client";

import { CheckCircle2, Clock3, Copy, ExternalLink, LoaderCircle, LockKeyhole, Send } from "lucide-react";
import { useState } from "react";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import type { CoursePaymentView, PaymentRequestBody } from "@/lib/course-access-api";
import {
  paywallCopy,
  paywallHistoryNote,
  paywallMode,
  phoneForCopy,
  priceChangedText,
  priceFromChangedDetails,
  priceLabel,
  safePaymentUrl,
  type Voice,
} from "@/lib/course-access-format";
import { errorToastText } from "@/lib/error-text";

/**
 * Stage 4: the paywall of a paid course. One component for the student («ты», in the player and on
 * the course page) and for the parent («вы», for a child): it reads the state of the course for
 * the person, shows how to pay and sends «Я оплатил» with the price the person saw.
 *
 * The student and the parent differ only in the two calls that are handed in.
 */
export function CoursePaywall({
  courseKey,
  voice,
  childName,
  load,
  submit,
  onChanged,
}: {
  /** Changes when the course (or the child) changes: the state is read again. */
  courseKey: string;
  voice: Voice;
  childName?: string;
  load: () => Promise<CoursePaymentView>;
  submit: (body: PaymentRequestBody) => Promise<unknown>;
  /** Called after a request was sent or the state moved under the person's hands. */
  onChanged?: () => void;
}) {
  const resource = useApiResource(load, [courseKey]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = paywallCopy(voice, childName);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="section" label="Загружаем условия курса" />;
  if (resource.error && !resource.data) {
    return (
      <section role="alert" className="rounded-[28px] border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-800" data-testid="course-paywall-error">
        <p>{resource.error}</p>
        <button
          type="button"
          onClick={() => void resource.reload()}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-ink px-5 text-sm font-bold text-white"
        >
          Повторить
        </button>
      </section>
    );
  }
  if (!resource.data) return null;

  const view = resource.data;
  const mode = paywallMode(view);
  const price = priceOverride ?? view.course.priceKzt;
  const details = view.paymentDetails;
  const kaspiUrl = safePaymentUrl(details.kaspiPayUrl);
  const history = paywallHistoryNote(view, voice);
  const resend = view.lastRequest?.displayStatus === "rejected";

  async function copyNumber() {
    if (!details.transferPhone) return;
    const text = phoneForCopy(details.transferPhone);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard permission (an old browser, a plain http page): select the text through a field.
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(field);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function send() {
    if (busy || !price) return;
    setBusy(true);
    setError(null);
    try {
      await submit({ expectedPriceKzt: price, payerNote: note });
      setSent(true);
      setNote("");
      setPriceNotice(null);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "PAYMENT_REQUEST_PENDING") {
        // Somebody (the child, the parent, a second tab) already sent it: just wait.
        setSent(true);
      } else if (reason instanceof ApiError && reason.code === "COURSE_PRICE_CHANGED") {
        const next = priceFromChangedDetails(reason.details);
        setPriceOverride(next);
        setPriceNotice(priceChangedText(next));
      } else {
        setError(errorToastText(reason, "Не получилось отправить заявку. Попробуйте ещё раз"));
      }
    } finally {
      setBusy(false);
    }
    // The state moves in every one of these cases (a request is waiting, the price is new): read it again.
    try {
      const fresh = await load();
      resource.setData(fresh);
      setPriceOverride(null);
    } catch {
      // The old state stays on the screen; the answer above already told what happened.
    }
    onChanged?.();
  }

  return (
    <section
      className="rounded-[28px] border border-gold/30 bg-paper p-4 shadow-soft sm:p-8"
      data-testid="course-paywall"
      data-mode={mode}
      aria-labelledby="course-paywall-title"
    >
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-gold-ink">
          <LockKeyhole size={21} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-ink">Курс</p>
          <h2 id="course-paywall-title" className="font-display mt-1 break-words text-2xl leading-tight sm:text-3xl">
            {view.course.title}
          </h2>
        </div>
      </div>

      {mode === "not_for_sale" ? (
        <p role="status" className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm font-bold text-stone-700" data-testid="paywall-not-for-sale">
          {copy.notForSale}
        </p>
      ) : mode === "school" ? (
        <p role="status" className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          {voice === "ty" ? "Этот курс входит в твоё обучение." : "Этот курс входит в обучение ребёнка."}
        </p>
      ) : (
        <>
          {price ? (
            <p className="font-display mt-6 text-3xl" data-testid="paywall-price">{priceLabel(price)}</p>
          ) : null}
          {priceNotice ? (
            <p role="status" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" data-testid="paywall-price-changed">
              {priceNotice}
            </p>
          ) : null}

          {mode === "pending" || sent ? (
            sent ? (
              <div role="status" className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900" data-testid="paywall-sent">
                <p className="flex items-center gap-2 text-sm font-black"><CheckCircle2 size={17} /> {copy.sentTitle}</p>
                <p className="mt-1 text-sm leading-6">{copy.sentText}</p>
              </div>
            ) : (
              <div role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950" data-testid="paywall-pending">
                <p className="flex items-center gap-2 text-sm font-black"><Clock3 size={17} /> {copy.pendingTitle}</p>
                <p className="mt-1 text-sm leading-6">{copy.pendingText}</p>
              </div>
            )
          ) : (
            <>
              <p className="mt-3 text-base font-bold">{copy.title}</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{price ? copy.lead(priceLabel(price)) : null}</p>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                {copy.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>

              {history ? (
                <p
                  role="status"
                  className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
                    history.tone === "rejected" ? "border-red-100 bg-red-50 text-red-800" : "border-stone-200 bg-stone-50 text-stone-700"
                  }`}
                  data-testid="paywall-history"
                >
                  {history.text}
                </p>
              ) : null}

              {details.configured ? (
                <div className="mt-6 space-y-4">
                  {kaspiUrl ? (
                    <a
                      href={kaspiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800"
                      data-testid="paywall-kaspi"
                    >
                      <ExternalLink size={16} /> {copy.kaspiButton}
                    </a>
                  ) : null}
                  {details.transferPhone ? (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4" data-testid="paywall-transfer">
                      <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{copy.transferTitle}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <p className="min-w-0 break-all font-display text-2xl" data-testid="paywall-phone">{details.transferPhone}</p>
                        <button
                          type="button"
                          onClick={() => void copyNumber()}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 text-sm font-bold text-ink transition hover:border-gold"
                        >
                          <Copy size={15} /> {copied ? copy.copied : copy.copyButton}
                        </button>
                      </div>
                      {details.recipientName ? (
                        <p className="mt-2 break-words text-sm text-stone-600">Получатель: <strong className="text-ink">{details.recipientName}</strong></p>
                      ) : null}
                    </div>
                  ) : null}
                  {details.hint ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-950" data-testid="paywall-hint">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800">{copy.hintTitle}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{details.hint}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-700" data-testid="paywall-not-configured">
                  {copy.notConfigured}
                </p>
              )}

              <label className="mt-6 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{copy.commentLabel}</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  name="payerNote"
                  autoComplete="off"
                  placeholder={copy.commentPlaceholder}
                  className="w-full resize-y rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold focus-visible:ring-2 focus-visible:ring-amber-100"
                />
              </label>

              {error ? (
                <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
              ) : null}

              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !price}
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-bold text-ink transition hover:brightness-95 disabled:opacity-60 sm:w-auto"
                data-testid="paywall-paid"
              >
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                {resend ? copy.resendButton : copy.paidButton}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
