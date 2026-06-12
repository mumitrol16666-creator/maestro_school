"use client";

import { BookOpen, Coins, GraduationCap, LogOut, Mail, Phone, Star, UserRound } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function SettingsPage() {
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

  if (resource.loading) return <LoadingState label="Загружаем профиль" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const profile = { ...user, ...resource.data?.profile };
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "Пользователь Maestro";
  const initials = profile.firstName && profile.lastName ? `${profile.firstName[0]}${profile.lastName[0]}` : fullName.slice(0, 2).toUpperCase();
  const roleLabel = profile.role === "student" ? "Ученик" : profile.role === "admin" ? "Администратор" : profile.role;
  const directions = resource.data?.directions ?? [];
  const courses = resource.data?.courses ?? [];

  return (
    <>
      <PageHeader eyebrow="Личный кабинет" title="Профиль" description="Ваши данные и активное обучение в Maestro." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[30px] bg-ink p-7 text-white shadow-soft">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">{initials}</div>
          <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
          <p className="mt-2 text-sm text-white/45">{roleLabel} Maestro</p>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center gap-3 text-white/60"><GraduationCap size={16} className="text-gold" /> {directions.length ? directions.map((item) => item.title).join(", ") : "Направления пока не выбраны"}</div>
            <div className="flex items-center gap-3 text-white/60"><UserRound size={16} className="text-gold" /> Роль: {roleLabel}</div>
            <div className="flex items-center gap-3 text-white/60"><Mail size={16} className="text-gold" /> {profile.email}</div>
            <div className="flex items-center gap-3 text-white/60"><Phone size={16} className="text-gold" /> {profile.phone ?? "Телефон не указан"}</div>
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
            <div className="mt-5 space-y-3">{courses.length ? courses.map((course) => <Link key={course.id} href={`/courses/${course.id}`} className="card-hover flex items-center gap-4 rounded-2xl border border-transparent bg-stone-50 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-gold ring-1 ring-gold/10"><BookOpen size={17} /></span><div><p className="font-bold">{course.title}</p><p className="mt-1 text-xs text-stone-400">{course.direction.title}</p></div></Link>) : <p className="text-sm text-stone-500">Вы еще не начали ни одного курса.</p>}</div>
          </div>
        </section>
      </div>
    </>
  );
}
