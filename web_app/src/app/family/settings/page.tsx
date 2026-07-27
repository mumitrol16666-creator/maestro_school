"use client";

import { LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { ChangePasswordForm } from "@/components/change-password-form";
import { useAuth } from "@/components/auth-provider";
import { formatFio } from "@/lib/name";

export default function FamilySettingsPage() {
  const { user, logout } = useAuth();
  const fullName = user ? formatFio(user) : "";

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Семейный кабинет</p>
        <h1 className="font-display mt-3 text-4xl sm:text-5xl">Настройки аккаунта</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          Данные для входа в родительский профиль Maestro.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <section className="rounded-[28px] bg-ink p-6 text-white shadow-soft sm:p-8">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-gold">
            <UserRound size={26} />
          </div>
          <h2 className="font-display mt-6 text-3xl">{fullName || "Родитель Maestro"}</h2>
          <p className="mt-2 text-sm text-white/45">Родительский профиль</p>
          <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm text-white/60">
            <p>Логин: <span className="font-semibold text-white">{user?.login || "не указан"}</span></p>
            <p>Телефон: <span className="font-semibold text-white">{user?.phone || "не указан"}</span></p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white/80"
          >
            <LogOut size={16} />
            Выйти из кабинета
          </button>
        </section>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <div className="flex items-center gap-3">
              <LockKeyhole className="text-gold" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Безопасность</p>
                <h2 className="font-display mt-1 text-3xl">Сменить пароль</h2>
              </div>
            </div>
            <div className="mt-6">
              <ChangePasswordForm />
            </div>
          </section>

          <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
            <ShieldCheck className="text-emerald-700" />
            <h2 className="font-display mt-4 text-2xl text-emerald-950">Защищённый семейный доступ</h2>
            <p className="mt-3 text-sm leading-6 text-emerald-900/70">
              Здесь доступны только расписание, домашние задания, итоги занятий и абонемент
              привязанных учеников. Переписки, курсы, тесты и ученический профиль закрыты.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
