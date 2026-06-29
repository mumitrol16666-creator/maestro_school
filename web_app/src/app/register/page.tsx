"use client";

import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { Brand } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, loading: authLoading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.replace(["admin", "owner"].includes(user.role) ? "/admin" : "/courses");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setFirstName(params.get("firstName") ?? "");
    setLastName(params.get("lastName") ?? "");
    setMiddleName(params.get("middleName") ?? "");
    setPhone(params.get("phone") ?? "");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        firstName,
        lastName,
        middleName: middleName.trim() || undefined,
        phone: phone.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
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
      <AuthHeroPanel />
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Новый ученик</p>
          <h2 className="font-display mt-3 text-5xl">Регистрация</h2>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Фамилия</span><input required maxLength={128} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Имя</span><input required maxLength={128} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
            </div>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Отчество <span className="normal-case tracking-normal font-normal text-stone-400">(если есть)</span></span><input maxLength={128} value={middleName} onChange={(event) => setMiddleName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Телефон WhatsApp</span>
              <input type="tel" required minLength={10} maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Пароль</span>
              <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-4 focus-within:border-gold">
                <input type={showPassword ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 rounded-2xl px-4 py-4 text-sm outline-none" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} className="text-stone-400">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
              <span className="mt-2 block text-xs text-stone-400">От 8 до 72 символов</span>
            </label>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Email <span className="normal-case tracking-normal font-normal text-stone-400">(необязательно)</span></span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none focus:border-gold" /></label>
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
