"use client";

import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { AndroidAppDownloadLink } from "@/components/android-app-download";
import { Brand } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";
import { isStaffRole } from "@/lib/role-labels";

function homePathForRole(role?: string | null) {
  if (!role || role === "student") return "/dashboard";
  if (role === "admin" || role === "owner" || role === "super_admin") return "/admin";
  if (isStaffRole(role)) return "/admin/offline-lessons";
  return "/dashboard";
}

function safeNextPath(next: string | null, role?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return homePathForRole(role);
  }
  return next;
}

const TRIAL_LANDING_URL =
  process.env.NEXT_PUBLIC_TRIAL_LANDING_URL ?? "https://app-maestro-school.duckdns.org/trial.html";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithSso, user, loading: authLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ssoPending, setSsoPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ssoStartedRef = useRef(false);

  useEffect(() => {
    if (!authLoading && user) router.replace(homePathForRole(user.role));
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || user || ssoStartedRef.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get("ssoToken");
    if (!ssoToken) return;

    ssoStartedRef.current = true;
    let cancelled = false;

    async function completeSso() {
      setSsoPending(true);
      setError(null);
      try {
        const loggedInUser = await loginWithSso(ssoToken!);
        if (cancelled) return;
        const target = safeNextPath(params.get("next"), loggedInUser.role);
        router.replace(target);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof ApiError ? reason.message : "Не удалось войти по ссылке из личного кабинета");
        }
      } finally {
        if (!cancelled) setSsoPending(false);
      }
    }

    void completeSso();
    return () => {
      cancelled = true;
    };
  }, [authLoading, loginWithSso, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedInUser = await login(phone, password);
      router.replace(homePathForRole(loggedInUser.role));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось войти в кабинет");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || ssoPending;

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel />

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
            <p className="mt-5 text-sm leading-6 text-stone-500">
              Уроки, домашние задания, онлайн-занятия и прогресс — в одном личном кабинете Maestro.
            </p>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Личный кабинет</p>
          <h2 className="font-display mt-3 text-5xl">Вход в личный кабинет</h2>
          <p className="mt-4 text-sm leading-6 text-stone-500">
            {ssoPending
              ? "Открываем ваш кабинет..."
              : "Продолжайте обучение, смотрите задания, материалы и прогресс."}
          </p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Телефон</span>
              <input
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+7 999 123-45-67"
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm outline-none transition focus:border-gold"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Пароль</span>
              <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-4 focus-within:border-gold">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl px-4 py-4 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="text-stone-400"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" /> Входим...
                </>
              ) : (
                <>
                  Войти в кабинет <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <AndroidAppDownloadLink />

          <div className="mt-8 rounded-2xl border border-gold/20 bg-gold/5 px-4 py-4 text-center">
            <p className="text-sm font-bold text-ink">Платформа Maestro — для учеников школы</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Это внутренняя экосистема: уроки, домашние задания, материалы и прогресс. Доступ выдаём после записи в школу.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm font-bold text-ink">Хотите стать учеником Maestro?</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Запишитесь на пробный урок на сайте. Администратор свяжется с вами и подберёт удобное время.
            </p>
            <a
              href={TRIAL_LANDING_URL}
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-gold transition hover:text-ink"
            >
              Записаться на пробный урок <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
