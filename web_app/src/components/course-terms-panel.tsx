"use client";

import { Check, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { inputClass, primaryButton } from "@/components/admin-ui";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { cmsApi } from "@/lib/cms-api";
import { parseCoursePrice, parseFreeLessons, formatTenge } from "@/lib/course-payments-format";
import type { CmsCourse } from "@/types/cms";

type Terms = Pick<CmsCourse, "priceKzt" | "includedInSchool" | "freeLessonsCount">;

interface FormState {
  price: string;
  freeLessons: string;
  includedInSchool: boolean;
}

function toForm(terms: Terms): FormState {
  return {
    price: terms.priceKzt === null ? "" : String(terms.priceKzt),
    freeLessons: String(terms.freeLessonsCount),
    includedInSchool: terms.includedInSchool,
  };
}

/** Who pays for a course and how much: the price, the free lessons and the school flag. */
export function CourseTermsPanel({
  courseId,
  terms,
  onSaved,
}: {
  courseId: string;
  terms: Terms;
  onSaved: () => Promise<unknown> | void;
}) {
  const [form, setForm] = useState<FormState>(toForm(terms));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setForm(toForm(terms));
  }, [terms.priceKzt, terms.includedInSchool, terms.freeLessonsCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseline = toForm(terms);
  const dirty = form.price.replace(/\s/g, "") !== baseline.price
    || form.freeLessons.trim() !== baseline.freeLessons
    || form.includedInSchool !== baseline.includedInSchool;
  useUnsavedChanges(dirty);

  const price = parseCoursePrice(form.price);
  const freeLessons = parseFreeLessons(form.freeLessons);
  const priced = price.ok && price.value !== null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!price.ok || !freeLessons.ok) return;
    setSaving(true);
    setMessage(null);
    try {
      await cmsApi.updateCourse(courseId, {
        priceKzt: price.value,
        includedInSchool: form.includedInSchool,
        freeLessonsCount: freeLessons.value,
      });
      await onSaved();
      setMessage({
        kind: "ok",
        text: price.value === null
          ? "Сохранено. Курс бесплатный: все уроки открыты всем."
          : `Сохранено. Курс платный: ${formatTenge(price.value)} за 6 месяцев.`,
      });
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "Не удалось сохранить условия курса" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mb-6 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-6" data-testid="course-terms">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-ink">Доступ и оплата</p>
          <h2 className="font-display mt-1 text-2xl sm:text-3xl">
            {terms.priceKzt === null ? "Курс бесплатный" : `${formatTenge(terms.priceKzt)} за 6 месяцев`}
          </h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-bold text-stone-700">
          Цена за 6 месяцев, ₸
          <input
            inputMode="numeric"
            data-testid="course-price-input"
            value={form.price}
            onChange={(event) => setForm({ ...form, price: event.target.value })}
            placeholder="Пусто — курс бесплатный"
            className={`${inputClass} mt-2 font-normal`}
            aria-invalid={!price.ok}
            aria-describedby="course-price-hint"
          />
          <span id="course-price-hint" className="mt-1 block text-xs font-normal leading-5 text-stone-500">
            Пустое поле — курс бесплатный целиком, платить за него не нужно. Если указать цену, остальные уроки откроются после оплаты на 6 месяцев.
          </span>
          {!price.ok ? <span role="alert" className="mt-1 block text-xs font-semibold text-red-700">{price.error}</span> : null}
        </label>
        <label className="block text-sm font-bold text-stone-700">
          Бесплатных уроков
          <input
            type="number"
            inputMode="numeric"
            data-testid="course-free-lessons-input"
            min={0}
            max={50}
            value={form.freeLessons}
            onChange={(event) => setForm({ ...form, freeLessons: event.target.value })}
            className={`${inputClass} mt-2 font-normal`}
            aria-invalid={!freeLessons.ok}
          />
          <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">
            Первые опубликованные уроки открыты всем, чтобы попробовать курс. По умолчанию 2.
            {priced ? "" : " Работает, только когда задана цена."}
          </span>
          {!freeLessons.ok ? <span role="alert" className="mt-1 block text-xs font-semibold text-red-700">{freeLessons.error}</span> : null}
        </label>
      </div>
      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.includedInSchool}
          onChange={(event) => setForm({ ...form, includedInSchool: event.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-gold"
        />
        <span>
          <span className="block font-bold text-ink">Входит в обучение школы (ученикам бесплатно)</span>
          <span className="mt-0.5 block text-xs leading-5 text-stone-500">
            Ученики школы, привязанные к CRM, видят весь курс без оплаты. Остальные платят по цене.
          </span>
        </span>
      </label>
      {terms.priceKzt !== null ? (
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Если изменить цену, уже отправленные заявки сохранят прежнюю сумму, а доступ тех, кто уже оплатил, не изменится.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button disabled={saving || !dirty || !price.ok || !freeLessons.ok} className={`${primaryButton} w-full sm:w-auto`}>
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
          Сохранить условия
        </button>
        {message && (message.kind === "error" || !dirty) ? (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm font-semibold ${message.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>
        ) : dirty ? (
          <p className="text-sm font-semibold text-amber-800">Есть несохранённые изменения</p>
        ) : null}
      </div>
    </form>
  );
}
