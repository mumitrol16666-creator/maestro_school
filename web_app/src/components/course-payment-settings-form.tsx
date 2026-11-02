"use client";

import { Check, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { inputClass, primaryButton } from "@/components/admin-ui";
import { ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { coursePaymentsApi } from "@/lib/course-payments-api";
import { formatSchoolDateTime } from "@/lib/course-payments-format";

interface FormState {
  kaspiPayUrl: string;
  transferPhone: string;
  recipientName: string;
  hint: string;
}

const emptyForm: FormState = { kaspiPayUrl: "", transferPhone: "", recipientName: "", hint: "" };

/** Where a student or a parent pays: one set of details for the whole school. */
export function CoursePaymentSettingsForm() {
  const resource = useApiResource(() => coursePaymentsApi.settings(), []);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!resource.data) return;
    setForm({
      kaspiPayUrl: resource.data.kaspiPayUrl ?? "",
      transferPhone: resource.data.transferPhone ?? "",
      recipientName: resource.data.recipientName ?? "",
      hint: resource.data.hint ?? "",
    });
  }, [resource.data]);

  if (resource.loading && !resource.data) return <LoadingState label="Открываем реквизиты" />;
  if (resource.error && !resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;

  const link = form.kaspiPayUrl.trim();
  const linkError = link && !/^https:\/\/\S+$/i.test(link) ? "Ссылка должна начинаться с https://" : null;
  const empty = !link && !form.transferPhone.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (linkError) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await coursePaymentsApi.saveSettings({
        kaspiPayUrl: link || null,
        transferPhone: form.transferPhone.trim() || null,
        recipientName: form.recipientName.trim() || null,
        hint: form.hint.trim() || null,
      });
      resource.setData(saved);
      setMessage({ kind: "ok", text: "Реквизиты сохранены. Ученики и родители видят их сразу." });
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "Не удалось сохранить реквизиты" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-6" data-testid="payment-settings-form">
      <h2 className="font-display text-2xl">Реквизиты оплаты</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Их видит ученик или родитель на странице платного урока. Нужна хотя бы ссылка Kaspi Pay или номер для перевода.
      </p>
      {empty ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
          Реквизиты пока не заполнены: платящий не увидит, куда переводить деньги.
        </p>
      ) : null}
      <div className="mt-5 space-y-4">
        <label className="block text-sm font-bold text-stone-700">
          Ссылка Kaspi Pay
          <input
            type="url"
            inputMode="url"
            value={form.kaspiPayUrl}
            onChange={(event) => setForm({ ...form, kaspiPayUrl: event.target.value })}
            placeholder="https://pay.kaspi.kz/pay/…"
            className={`${inputClass} mt-2 font-normal`}
            aria-invalid={Boolean(linkError)}
          />
          {linkError ? <span role="alert" className="mt-1 block text-xs font-semibold text-red-700">{linkError}</span> : null}
        </label>
        <label className="block text-sm font-bold text-stone-700">
          Номер для перевода
          <input
            type="tel"
            value={form.transferPhone}
            onChange={(event) => setForm({ ...form, transferPhone: event.target.value })}
            placeholder="+7 7xx xxx-xx-xx"
            maxLength={32}
            className={`${inputClass} mt-2 font-normal`}
          />
        </label>
        <label className="block text-sm font-bold text-stone-700">
          Получатель
          <input
            value={form.recipientName}
            onChange={(event) => setForm({ ...form, recipientName: event.target.value })}
            placeholder="Как имя отображается в Kaspi"
            maxLength={255}
            className={`${inputClass} mt-2 font-normal`}
          />
        </label>
        <label className="block text-sm font-bold text-stone-700">
          Подсказка
          <textarea
            value={form.hint}
            onChange={(event) => setForm({ ...form, hint: event.target.value })}
            placeholder="Например: в комментарии к переводу укажите имя ученика."
            maxLength={2000}
            rows={3}
            className={`${inputClass} mt-2 min-h-24 font-normal`}
          />
        </label>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button disabled={saving || Boolean(linkError)} className={`${primaryButton} w-full sm:w-auto`}>
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
          Сохранить реквизиты
        </button>
        {resource.data?.updatedAt ? (
          <p className="text-xs text-stone-500">
            Изменено {formatSchoolDateTime(resource.data.updatedAt)}{resource.data.updatedBy ? `, ${resource.data.updatedBy.name}` : ""}
          </p>
        ) : null}
      </div>
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-4 text-sm font-semibold ${message.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
