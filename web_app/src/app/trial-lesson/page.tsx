"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, MessageCircle, Music2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { Brand } from "@/components/brand";
import { ApiError, api } from "@/lib/api-client";
import type { ApiDirection } from "@/types/api";

const LEVELS = ["Никогда не занимался", "Начинающий", "Продолжающий", "Не уверен"];

export default function TrialLessonPage() {
  const [directions, setDirections] = useState<ApiDirection[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState("");
  const [level, setLevel] = useState(LEVELS[0]);
  const [preferredTime, setPreferredTime] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.directions()
      .then((items) => {
        setDirections(items);
        setDirection((current) => current || items[0]?.title || "");
      })
      .catch(() => setDirections([]));
  }, []);

  const registerHref = useMemo(() => {
    const params = new URLSearchParams({ firstName, lastName, phone });
    if (middleName.trim()) params.set("middleName", middleName.trim());
    return `/register?${params.toString()}`;
  }, [firstName, lastName, middleName, phone]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createTrialBooking({
        firstName,
        lastName,
        middleName: middleName.trim() || undefined,
        phone,
        direction,
        level,
        preferredTime,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSent(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
        <AuthHeroPanel />
        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-lg">
            <div className="mb-10 lg:hidden"><Brand /></div>
            <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={32} />
            </span>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.22em] text-gold">Заявка отправлена</p>
            <h1 className="font-display mt-3 text-5xl leading-tight">Мы напишем вам в WhatsApp</h1>
            <p className="mt-5 text-base leading-7 text-stone-500">
              Администратор получил заявку на пробный урок по направлению «{direction}» и свяжется с вами по номеру {phone}.
            </p>

            <div className="mt-8 rounded-[28px] border border-gold/20 bg-white p-6 shadow-soft">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold/10 text-gold"><Music2 size={20} /></span>
                <div>
                  <h2 className="font-display text-2xl">Пока ждёте ответ</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    Зарегистрируйтесь, чтобы посмотреть доступные курсы и выбрать дополнительные программы Maestro. Это не влияет на вашу заявку.
                  </p>
                </div>
              </div>
              <Link href={registerHref} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-stone-800">
                Зарегистрироваться и посмотреть курсы <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 px-5 py-4 text-sm font-bold text-ink transition hover:border-gold">
                Уже есть аккаунт — войти
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel />
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-lg py-8">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 transition hover:text-ink">
            <ArrowLeft size={16} /> Назад ко входу
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-gold">Первое знакомство</p>
          <h1 className="font-display mt-3 text-5xl leading-tight">Записаться на пробный урок</h1>
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-stone-500">
            <MessageCircle size={17} className="mt-1 shrink-0 text-gold" />
            Аккаунт создавать не нужно. После отправки администратор ответит вам в WhatsApp.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Фамилия"><input required maxLength={128} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></Field>
              <Field label="Имя"><input required maxLength={128} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></Field>
            </div>
            <Field label="Отчество"><input maxLength={128} value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={inputClass} /></Field>
            <Field label="Телефон WhatsApp"><input type="tel" required minLength={10} maxLength={32} autoComplete="tel" placeholder="+7 999 123-45-67" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Направление">
                {directions.length ? (
                  <select required value={direction} onChange={(e) => setDirection(e.target.value)} className={inputClass}>
                    {directions.map((item) => <option key={item.id} value={item.title}>{item.title}</option>)}
                  </select>
                ) : (
                  <input required maxLength={255} placeholder="Например, гитара" value={direction} onChange={(e) => setDirection(e.target.value)} className={inputClass} />
                )}
              </Field>
              <Field label="Ваш уровень">
                <select required value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
                  {LEVELS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Когда удобно заниматься"><input required maxLength={512} placeholder="Например, будни после 18:00" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className={inputClass} /></Field>
            <Field label="Комментарий (необязательно)"><textarea maxLength={4000} rows={3} placeholder="Расскажите, чего хотите достичь" value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} /></Field>
            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-60">
              {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Отправляем заявку...</> : <>Отправить заявку <ArrowRight size={17} /></>}
            </button>
            <p className="text-center text-xs leading-5 text-stone-400">Отправка заявки не создаёт аккаунт и не оформляет покупку.</p>
          </form>
        </div>
      </section>
    </main>
  );
}

const inputClass = "w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none transition focus:border-gold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{label}</span>
      {children}
    </label>
  );
}
