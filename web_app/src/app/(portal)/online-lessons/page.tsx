"use client";

import { CalendarClock, LoaderCircle, Send, Video } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { SuccessModal } from "@/components/success-modal";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError, api } from "@/lib/api-client";
import { levelOptions, onlineLessonStatusClasses, onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { formatPhoneDisplay } from "@/lib/phone";
import { onlineLessonsApi } from "@/lib/online-lessons-api";

export default function OnlineLessonsPage() {
  const { user } = useAuth();
  const directions = useApiResource(() => api.directions(), []);
  const requests = useApiResource(() => onlineLessonsApi.myRequests(), []);

  const [directionId, setDirectionId] = useState("");
  const [directionTitle, setDirectionTitle] = useState("");
  const [level, setLevel] = useState("beginner");
  const [preferredTime, setPreferredTime] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setShowSuccess(false);
    try {
      const title = directionId
        ? directions.data?.find((item) => item.id === directionId)?.title ?? directionTitle
        : directionTitle;
      await onlineLessonsApi.createRequest({
        directionId: directionId || null,
        directionTitle: title,
        level: levelOptions.find((item) => item.value === level)?.label ?? level,
        preferredTime,
        comment: comment.trim() || undefined,
      });
      setShowSuccess(true);
      setPreferredTime("");
      setComment("");
      await requests.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Живые занятия"
        title="Онлайн-уроки с преподавателем"
        description="Индивидуальный урок в Zoom: вы оставляете заявку, преподаватель назначает дату и ссылку, после занятия — итоги и домашнее задание."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <Video className="text-gold" size={24} />
          <h2 className="font-display mt-4 text-3xl">Онлайн-урок в Zoom</h2>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Формат живого занятия с преподавателем. Ссылка на Zoom появится после назначения урока.
          </p>
        </div>
        <div className="rounded-[28px] border border-stone-200 bg-ink p-6 text-white shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Maestro Coins</p>
          <p className="font-display mt-4 text-5xl">{(user?.coins ?? 0).toLocaleString("ru-RU")}</p>
          <p className="mt-2 text-sm text-white/60">Дополнительная награда от преподавателя после урока или ДЗ</p>
        </div>
      </div>

      <div className="grid gap-7 xl:grid-cols-[1fr_420px]">
        <section className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Заявка</p>
          <h2 className="font-display mt-3 text-3xl">Записаться на онлайн-урок</h2>

          {error && <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
          {user?.phone ? (
            <p className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
              Для связи используем WhatsApp: <span className="font-bold text-ink">{formatPhoneDisplay(user.phone)}</span>
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Направление
              <select
                value={directionId}
                onChange={(event) => {
                  setDirectionId(event.target.value);
                  const found = directions.data?.find((item) => item.id === event.target.value);
                  if (found) setDirectionTitle(found.title);
                }}
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <option value="">Другое направление</option>
                {directions.data?.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>

            {!directionId && (
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Название направления
                <input
                  required
                  value={directionTitle}
                  onChange={(event) => setDirectionTitle(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                  placeholder="Например: Гитара"
                />
              </label>
            )}

            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Уровень подготовки
              <select value={level} onChange={(event) => setLevel(event.target.value)} className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
                {levelOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Удобное время
              <input
                required
                value={preferredTime}
                onChange={(event) => setPreferredTime(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Например: будни после 18:00"
              />
            </label>

            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Комментарий
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Что хотите разобрать на уроке?"
              />
            </label>

            <button disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white disabled:opacity-50">
              {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
              Отправить заявку
            </button>
          </form>
        </section>

        <section className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Мои заявки</p>
          <h2 className="font-display mt-3 text-3xl">Статус занятий</h2>

          {requests.loading ? <div className="mt-6"><LoadingState label="Загружаем заявки" /></div> : null}
          {requests.error ? <div className="mt-6"><ErrorState message={requests.error} retry={requests.reload} /></div> : null}

          {!requests.loading && !requests.data?.length ? (
            <div className="mt-6"><EmptyState title="Заявок пока нет" description="Отправьте первую заявку на онлайн-урок." /></div>
          ) : null}

          <div className="mt-6 space-y-3">
            {requests.data?.map((item) => (
              <Link
                key={item.id}
                href={`/online-lessons/${item.id}`}
                className="card-hover block rounded-2xl border border-stone-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{item.directionTitle}</p>
                    <p className="mt-1 text-xs text-stone-500">{item.level} · {item.preferredTime}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${onlineLessonStatusClasses[item.status]}`}>
                    {onlineLessonStatusLabels[item.status]}
                  </span>
                </div>
                {item.scheduledAt && (
                  <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">
                    <CalendarClock size={14} />
                    {new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledAt))}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <SuccessModal
        open={showSuccess}
        title="Вы записаны на онлайн-урок"
        description="Заявка принята. Скоро с вами свяжутся в WhatsApp для согласования времени и деталей занятия."
        onClose={() => setShowSuccess(false)}
      />
    </>
  );
}
