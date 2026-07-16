"use client";

import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { Brand } from "@/components/brand";

const TRIAL_LANDING_URL =
  process.env.NEXT_PUBLIC_TRIAL_LANDING_URL ?? "https://app-maestro-school.duckdns.org/trial.html";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel />
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 transition hover:text-ink">
            <ArrowLeft size={16} /> Назад ко входу
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-gold">Внутренняя экосистема</p>
          <h2 className="font-display mt-3 text-5xl leading-tight">Доступ выдаёт школа</h2>
          <p className="mt-5 text-sm leading-6 text-stone-500">
            Платформа Maestro создана для действующих учеников: здесь уроки, домашние задания, материалы,
            онлайн-занятия и прогресс. Аккаунт открывает администратор после записи в школу.
          </p>

          <div className="mt-8 rounded-[28px] border border-gold/20 bg-white p-6 shadow-soft">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold/10 text-gold">
              <ShieldCheck size={22} />
            </span>
            <h3 className="mt-5 font-display text-3xl text-ink">Хотите начать обучение?</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Запишитесь на пробный урок по ссылке. Мы получим заявку, свяжемся с вами и поможем выбрать направление.
            </p>
            <a
              href={TRIAL_LANDING_URL}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-stone-800"
            >
              Записаться на пробный урок <ArrowRight size={17} />
            </a>
            <Link href="/login" className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 px-5 py-4 text-sm font-bold text-ink transition hover:border-gold">
              Уже есть доступ — войти
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
