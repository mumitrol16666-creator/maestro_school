"use client";

import { ArrowRight, Eye, EyeOff, LoaderCircle, Music2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, loading: authLoading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.replace(["admin", "owner"].includes(user.role) ? "/admin" : "/courses");
  }, [authLoading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        firstName,
        lastName,
        email,
        phone: phone.trim() || undefined,
        password,
      });
      router.replace("/courses");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось создать аккаунт");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <div className="noise absolute inset-0 opacity-20" />
        <div className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full border border-gold/20" />
        <div className="relative"><Brand /></div>
        <div className="relative my-auto max-w-xl">
          <span className="mb-8 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/5 text-gold"><Music2 /></span>
          <h1 className="font-display text-6xl leading-[1.08]">Начните свой путь в Maestro.</h1>
          <p className="mt-7 max-w-md text-base leading-7 text-white/55">Создайте аккаунт, выберите опубликованный курс и сразу приступайте к занятиям.</p>
        </div>
        <p className="relative text-xs uppercase tracking-[0.2em] text-white/30">Maestro education platform</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Новый ученик</p>
          <h2 className="font-display mt-3 text-5xl">Регистрация</h2>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Имя</span><input required maxLength={128} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Фамилия</span><input required maxLength={128} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
            </div>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Email</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Телефон <span className="font-normal normal-case text-stone-400">необязательно</span></span><input type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Пароль</span>
              <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-4 focus-within:border-gold">
                <input type={showPassword ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 rounded-2xl px-4 py-4 text-sm outline-none" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} className="text-stone-400">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
              <span className="mt-2 block text-xs text-stone-400">От 8 до 72 символов</span>
            </label>
            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white disabled:opacity-60">
              {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Создаем аккаунт...</> : <>Создать аккаунт <ArrowRight size={17} /></>}
            </button>
          </form>
          <p className="mt-7 text-center text-sm text-stone-500">Уже зарегистрированы? <Link href="/login" className="font-bold text-ink">Войти</Link></p>
        </div>
      </section>
    </main>
  );
}
