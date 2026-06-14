"use client";

import { Link2, LoaderCircle, Search, Unplug } from "lucide-react";
import { useState } from "react";
import { usersApi, type CrmLinkStatus, type CrmLookupResult } from "@/lib/users-api";
import { formatPhoneDisplay } from "@/lib/phone";

const linkStatusLabels: Record<string, string> = {
  linked: "Связан",
  unlinked: "Не связан",
  pending: "Ожидает привязки",
  conflict: "Конфликт",
  manual_review: "Нужна проверка",
};

const linkStatusClasses: Record<string, string> = {
  linked: "bg-emerald-50 text-emerald-800",
  unlinked: "bg-stone-100 text-stone-600",
  pending: "bg-sky-50 text-sky-900",
  conflict: "bg-red-50 text-red-800",
  manual_review: "bg-amber-50 text-amber-900",
};

export function CrmLinkPanel({
  userId,
  phone,
  role,
  onLinked,
}: {
  userId: string;
  phone: string;
  role: string;
  onLinked: () => Promise<void>;
}) {
  const [data, setData] = useState<CrmLinkStatus | null>(null);
  const [lookup, setLookup] = useState<CrmLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const status = await usersApi.crmLink(userId);
      setData(status);
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить статус связи");
    } finally {
      setLoading(false);
    }
  }

  async function searchCrm() {
    setLoading(true);
    setError(null);
    try {
      const result = await usersApi.crmLookup(phone);
      setLookup(result);
      if (!result.found) {
        setError("В CRM нет ученика/преподавателя с этим телефоном. Сначала создайте карточку в CRM.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Поиск в CRM не удался");
    } finally {
      setLoading(false);
    }
  }

  async function linkAccount() {
    setLinking(true);
    setError(null);
    setMessage(null);
    try {
      await usersApi.linkToCrm(userId, lookup?.crmUserId);
      setMessage("Аккаунт связан с CRM. Офлайн-уроки и абонементы теперь доступны.");
      await onLinked();
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось привязать аккаунт");
    } finally {
      setLinking(false);
    }
  }

  const status = data?.externalLinkStatus ?? "unlinked";
  const isLinked = status === "linked" || Boolean(data?.crmStudentId || data?.crmTeacherId);

  return (
    <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <div className="flex items-center gap-3">
        <Link2 size={18} className="text-gold" />
        <div>
          <h2 className="font-display text-2xl">Связь с CRM</h2>
          <p className="mt-1 text-sm text-stone-500">
            Нужна для разделов «Уроки в школе» и «Офлайн-уроки».
          </p>
        </div>
      </div>

      {!loaded ? (
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-ink"
        >
          {loading ? "Загрузка..." : "Проверить статус связи"}
        </button>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${linkStatusClasses[status] ?? linkStatusClasses.unlinked}`}>
              {linkStatusLabels[status] ?? status}
            </span>
            {data?.crmStudentId ? (
              <span className="text-xs text-stone-500">crmStudentId: <code>{data.crmStudentId}</code></span>
            ) : null}
            {data?.crmTeacherId ? (
              <span className="text-xs text-stone-500">crmTeacherId: <code>{data.crmTeacherId}</code></span>
            ) : null}
          </div>

          {data?.linkedAt ? (
            <p className="text-xs text-stone-500">
              Связан: {new Date(data.linkedAt).toLocaleString("ru-RU")}
            </p>
          ) : null}

          {data?.crmLookup?.found ? (
            <div className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
              <p className="font-bold text-ink">Найден в CRM</p>
              <p className="mt-1">{data.crmLookup.name}</p>
              <p className="text-xs text-stone-500">
                Роль: {data.crmLookup.role} · ID: {data.crmLookup.crmUserId}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {!isLinked ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-stone-600">
            Телефон в приложении: <span className="font-bold">{formatPhoneDisplay(phone)}</span>
            {role === "teacher" ? " · привязка к преподавателю CRM" : " · привязка к ученику CRM"}
          </p>

          <button
            type="button"
            onClick={() => void searchCrm()}
            disabled={loading || linking}
            className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-ink"
          >
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
            Найти в CRM по телефону
          </button>

          {lookup?.found ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-900">{lookup.name}</p>
              <p className="mt-1 text-xs text-emerald-800">
                {lookup.role === "teacher" ? "Преподаватель" : "Ученик"} · {lookup.crmUserId}
              </p>
              <button
                type="button"
                onClick={() => void linkAccount()}
                disabled={linking}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {linking ? <LoaderCircle size={16} className="animate-spin" /> : <Link2 size={16} />}
                Привязать аккаунт
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Unplug size={16} />
          Связь активна — офлайн-разделы доступны пользователю.
        </p>
      )}

      {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}
    </section>
  );
}
