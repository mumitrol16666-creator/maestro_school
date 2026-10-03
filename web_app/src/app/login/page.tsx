"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  GraduationCap,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { AndroidAppDownloadLink } from "@/components/android-app-download";
import { Brand } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";
import { homePathForRole, isStaffRole } from "@/lib/role-labels";

function safeNextPath(next: string | null, role?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return homePathForRole(role);
  }
  if (isStaffRole(role) && !next.startsWith("/admin")) {
    return homePathForRole(role);
  }
  if (role === "parent" && !next.startsWith("/family")) {
    return homePathForRole(role);
  }
  if (!isStaffRole(role) && role !== "parent" && (next.startsWith("/admin") || next.startsWith("/family"))) {
    return homePathForRole(role);
  }
  return next;
}

const TRIAL_LANDING_URL =
  process.env.NEXT_PUBLIC_TRIAL_LANDING_URL ?? "https://app-maestro-school.duckdns.org/trial.html";

const LOGIN_COPY = {
  student: {
    heading: "Вход ученика",
    description: "Откройте задания, материалы, расписание и свой учебный прогресс.",
    identityLabel: "Логин, email или телефон",
    placeholder: "s_77001234567",
    helper: "Войдите по своему логину, email или номеру телефона.",
  },
  parent: {
    heading: "Вход родителя",
    description: "Следите за расписанием, оплатой и прогрессом ребёнка в семейном кабинете.",
    identityLabel: "Телефон, email или логин родителя",
    placeholder: "Телефон или логин родителя",
    helper: "Выберите профиль родителя. Его пароль может отличаться от пароля ученика.",
  },
  staff: {
    heading: "Вход сотрудника",
    description: "Откройте расписание, отчёты, проверки и рабочие разделы школы.",
    identityLabel: "Логин сотрудника",
    placeholder: "Логин сотрудника",
    helper: "Используйте учётную запись, выданную администратором школы.",
  },
} as const;

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithSso, user, loading: authLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<"student" | "parent" | "staff">("student");
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
      const loggedInUser = await login(phone, password, profile);
      router.replace(homePathForRole(loggedInUser.role));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось войти в кабинет");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || ssoPending;
  const selectedCopy = LOGIN_COPY[profile];

  return (
    <main className="grid min-h-screen bg-cream lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel profile={profile} />

      <section className="flex items-center justify-center px-5 py-8 sm:p-10 lg:py-12">
        <div className="w-full max-w-md">
          <div className="mb-7 lg:hidden">
            <Brand />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold-ink">Личный кабинет</p>
          <h1 className="font-display mt-3 text-balance text-3xl leading-tight sm:text-[2.5rem]">{selectedCopy.heading}</h1>
          <p className="mt-4 text-sm leading-6 text-stone-500">
            {ssoPending
              ? "Открываем ваш кабинет…"
              : selectedCopy.description}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                Какой кабинет открыть
              </legend>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1.5">
                {([
                  { value: "student", label: "Ученик", icon: GraduationCap },
                  { value: "parent", label: "Родитель", icon: UsersRound },
                  { value: "staff", label: "Сотрудник", icon: BriefcaseBusiness },
                ] as const).map((item) => {
                  const Icon = item.icon;
                  const selected = profile === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setProfile(item.value);
                        setError(null);
                      }}
                      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-bold transition sm:flex-row ${
                        selected
                          ? "bg-charcoal text-white shadow-sm"
                          : "text-stone-500 hover:bg-white hover:text-ink"
                      }`}
                    >
                      <Icon size={16} className={selected ? "text-gold-ink" : undefined} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{selectedCopy.identityLabel}</span>
              <input
                type="text"
                required
                autoComplete="username"
                name="username"
                spellCheck={false}
                autoCapitalize="none"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={selectedCopy.placeholder}
                className="brand-input py-3.5"
              />
              <span className="mt-2 block text-xs leading-5 text-stone-500">
                {selectedCopy.helper}
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Пароль</span>
              <span className="flex items-center rounded-xl border border-stone-300 bg-paper pr-1 focus-within:border-gold">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="current-password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button
              disabled={busy}
              className="brand-button-primary w-full py-3.5"
            >
              {busy ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" /> Входим…
                </>
              ) : (
                <>
                  Войти в кабинет <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <AndroidAppDownloadLink />

          {profile === "staff" ? (
            <div className="mt-6 border-t border-stone-200 pt-5">
              <p className="text-sm font-bold text-ink">Нет доступа к рабочему кабинету?</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Обратитесь к администратору школы, чтобы проверить учётную запись и назначенную роль.
              </p>
            </div>
          ) : (
            <div className="mt-6 border-t border-stone-200 pt-5">
              <p className="text-sm font-bold text-ink">Хотите стать учеником Maestro?</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Запишитесь на пробный урок на сайте. Администратор свяжется с вами и подберёт удобное время.
              </p>
              <a
                href={TRIAL_LANDING_URL}
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-gold-ink transition hover:text-ink"
              >
                Записаться на пробный урок <ArrowRight size={15} />
              </a>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
