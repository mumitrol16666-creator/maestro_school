"use client";

import { Bell, ChevronRight, GraduationCap, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

const settings = [
  { icon: Bell, title: "Уведомления", description: "Домашние задания, новости и напоминания" },
  { icon: LockKeyhole, title: "Безопасность", description: "Пароль и активные устройства" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const resource = useApiResource(async () => {
    const [profile, directions, progress] = await Promise.all([api.me(), api.directions(), api.progress()]);
    const directionId = progress.enrollments[0]?.course.directionId;
    return { profile, direction: directions.find((item) => item.id === directionId) ?? null };
  }, []);

  if (resource.loading) return <LoadingState label="Загружаем профиль" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;

  const profile = { ...user, ...resource.data?.profile };
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email || "Пользователь Maestro";
  const initials = profile.firstName && profile.lastName ? `${profile.firstName[0]}${profile.lastName[0]}` : fullName.slice(0, 2).toUpperCase();
  const roleLabel = profile.role === "student" ? "Ученик" : profile.role === "admin" ? "Администратор" : profile.role;
  const direction = resource.data?.direction?.title ?? "Не назначено";

  return (
    <>
      <PageHeader eyebrow="Личный кабинет" title="Настройки" description="Просматривайте профиль и параметры своего кабинета." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[30px] bg-ink p-7 text-white shadow-soft">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">{initials}</div>
          <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
          <p className="mt-2 text-sm text-white/45">{roleLabel} Maestro</p>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center gap-3 text-white/60"><GraduationCap size={16} className="text-gold" /> Направление: {direction}</div>
            <div className="flex items-center gap-3 text-white/60"><UserRound size={16} className="text-gold" /> Роль: {roleLabel}</div>
            <div className="flex items-center gap-3 text-white/60"><Mail size={16} className="text-gold" /> {profile.email}</div>
            <div className="flex items-center gap-3 text-white/60"><Phone size={16} className="text-gold" /> {profile.phone ?? "Телефон не указан"}</div>
          </div>
        </section>
        <section className="space-y-5">
          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Обучение</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-stone-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Направление</p><p className="font-display mt-3 text-2xl">{direction}</p></div><div className="rounded-2xl bg-stone-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Баллы</p><p className="font-display mt-3 text-2xl">{profile.points ?? 0}</p></div></div></div>
          <div className="overflow-hidden rounded-[30px] border border-stone-200 bg-paper shadow-soft">{settings.map(({ icon: Icon, title, description }, index) => <div key={title} className={`flex w-full items-center gap-4 p-6 text-left ${index ? "border-t border-stone-100" : ""}`}><span className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-100 text-gold"><Icon size={18} /></span><span className="flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs text-stone-400">{description}</span></span><ChevronRight size={18} className="text-stone-300" /></div>)}</div>
          <div className="flex items-center gap-4 rounded-[24px] border border-emerald-100 bg-emerald-50 p-5 text-emerald-800"><ShieldCheck size={21} /><div><p className="text-sm font-bold">Аккаунт защищен</p><p className="mt-1 text-xs opacity-70">Данные получены через защищенный API</p></div></div>
        </section>
      </div>
    </>
  );
}
