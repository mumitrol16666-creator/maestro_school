"use client";

import { BookOpen, Coins, Eye, EyeOff, GraduationCap, LoaderCircle, LogOut, Mail, Phone, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { isStudentRole, roleLabel, settingsPathForRole } from "@/lib/role-labels";

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const resource = useApiResource(async () => {
    const [profile, directions, progress] = await Promise.all([api.me(), api.directions(), api.progress()]);
    const activeDirectionIds = new Set(progress.enrollments.map((item) => item.course.directionId));
    return {
      profile,
      directions: directions.filter((item) => activeDirectionIds.has(item.id)),
      courses: progress.enrollments.map((item) => item.course),
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isStudentRole(user.role)) {
      router.replace(settingsPathForRole(user.role));
    }
  }, [router, user]);

  if (!user || !isStudentRole(user.role)) {
    return <LoadingState label="Открываем профиль" />;
  }

  if (resource.loading) return <LoadingState label="Загружаем профиль" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const profile = { ...user, ...resource.data?.profile };
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "Пользователь Maestro";
  const initials = profile.firstName && profile.lastName ? `${profile.firstName[0]}${profile.lastName[0]}` : fullName.slice(0, 2).toUpperCase();
  const directions = resource.data?.directions ?? [];
  const courses = resource.data?.courses ?? [];

  return (
    <>
      <PageHeader eyebrow="Личный кабинет" title="Профиль" description="Ваши данные и активное обучение в Maestro." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[30px] bg-ink p-7 text-white shadow-soft">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">{initials}</div>
          <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
          <p className="mt-2 text-sm text-white/45">{roleLabel(profile.role)} Maestro</p>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center gap-3 text-white/60"><GraduationCap size={16} className="text-gold" /> {directions.length ? directions.map((item) => item.title).join(", ") : "Направления пока не выбраны"}</div>
            <div className="flex items-center gap-3 text-white/60"><UserRound size={16} className="text-gold" /> Роль: {roleLabel(profile.role)}</div>
            <div className="flex items-center gap-3 text-white/60"><Mail size={16} className="text-gold" /> {profile.email}</div>
            <div className="flex items-center gap-3 text-white/60"><Phone size={16} className="text-gold" /> {profile.phone && profile.phone !== "00000000000" ? profile.phone : "Телефон не указан"}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
          >
            <LogOut size={16} />
            Выйти из кабинета
          </button>
        </section>
        <section className="space-y-5">
          <PwaInstallCard />
          <PushNotificationsCard />
          <PasswordChangeCard />
          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Обучение</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-stone-50 p-5">
                <GraduationCap size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Направления</p>
                <p className="font-display mt-3 text-2xl">{directions.length || 0}</p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-5">
                <Star size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Баллы</p>
                <p className="font-display mt-3 text-2xl">{(profile.points ?? 0).toLocaleString("ru-RU")}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-5">
                <Coins size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-700">Maestro Coins</p>
                <p className="font-display mt-3 text-2xl text-amber-950">{(profile.coins ?? 0).toLocaleString("ru-RU")}</p>
                <p className="mt-2 text-xs leading-5 text-amber-800">Награда от преподавателя после онлайн-уроков и ДЗ</p>
              </div>
            </div>
          </div>
          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Активные курсы</p>
            <div className="mt-5 space-y-3">
              {courses.length ? courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="card-hover flex items-center gap-4 rounded-2xl border border-transparent bg-stone-50 p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-gold ring-1 ring-gold/10"><BookOpen size={17} /></span>
                  <div>
                    <p className="font-bold">{course.title}</p>
                    <p className="mt-1 text-xs text-stone-400">{course.direction.title}</p>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-stone-500">Вы еще не начали ни одного курса.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function PasswordChangeCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("Новый пароль должен содержать минимум 8 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сменить пароль");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Безопасность</p>
      <h3 className="mt-3 text-lg font-bold">Сменить пароль</h3>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Текущий пароль</span>
          <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-4 focus-within:border-gold">
            <input
              type={showCurrent ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={() => setShowCurrent((c) => !c)} aria-label={showCurrent ? "Скрыть пароль" : "Показать пароль"} className="text-stone-400">
              {showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Новый пароль</span>
          <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-4 focus-within:border-gold">
            <input
              type={showNew ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={() => setShowNew((c) => !c)} aria-label={showNew ? "Скрыть пароль" : "Показать пароль"} className="text-stone-400">
              {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
          <span className="mt-2 block text-xs text-stone-400">От 8 до 72 символов</span>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Подтвердите новый пароль</span>
          <input
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
          />
        </label>
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {success && <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">Пароль успешно изменён</p>}
        <button
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <LoaderCircle size={17} className="animate-spin" /> Сохраняем...
            </>
          ) : (
            "Сменить пароль"
          )}
        </button>
      </form>
    </div>
  );
}
