"use client";

import { Award, BookOpen, Camera, Coins, Eye, EyeOff, Flame, GraduationCap, LoaderCircle, LogOut, Mail, Phone, Save, Send, Star, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
import { AchievementsWall } from "@/components/achievements-wall";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api-client";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { LevelSummary } from "@/components/level-summary";
import { PwaInstallCard } from "@/components/pwa-install-card";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { AndroidAppDownloadCard } from "@/components/android-app-download";
import { ImprovementSuggestionCard } from "@/components/improvement-suggestion-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { formatFio, initialsFromName } from "@/lib/name";
import { isStudentRole, roleLabel, settingsPathForRole } from "@/lib/role-labels";
import { familyApi } from "@/lib/family-api";
import type { ParentVisibility } from "@/types/family";

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [activeSection, setActiveSection] = useState<"overview" | "data" | "settings">("overview");
  const resource = useApiResource(async () => {
    const profile = await api.me();
    const [directionsResult, progressResult, schoolResult, economyResult, achievementsResult] = await Promise.allSettled([
      api.directions(),
      api.progress(),
      api.studentOfflineSummary(),
      api.studentEconomyProfile(),
      api.achievements(),
    ]);
    const directions = directionsResult.status === "fulfilled" ? directionsResult.value : [];
    const progress = progressResult.status === "fulfilled" ? progressResult.value : { enrollments: [] };
    const school = schoolResult.status === "fulfilled" ? schoolResult.value : null;
    const activeDirectionIds = new Set(progress.enrollments.map((item) => item.course.directionId));
    return {
      profile,
      directions: directions.filter((item) => activeDirectionIds.has(item.id)),
      courses: progress.enrollments.map((item) => item.course),
      school,
      economy: economyResult.status === "fulfilled" ? economyResult.value : null,
      achievements: achievementsResult.status === "fulfilled" ? achievementsResult.value : null,
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
  const fullName = formatFio(profile) || "Пользователь Maestro";
  const initials = initialsFromName(profile);
  const directions = resource.data?.directions ?? [];
  const courses = resource.data?.courses ?? [];
  const school = resource.data?.school;
  const economy = resource.data?.economy ?? null;
  const achievements = resource.data?.achievements ?? null;
  const level = economy?.level ?? null;
  const offlineGroups = school?.profile.groups ?? [];

  return (
    <>
      <PageHeader eyebrow="Личный кабинет" title="Профиль" description="Учебный прогресс, данные и настройки аккаунта." />
      <nav
        aria-label="Разделы профиля"
        className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-stone-200 bg-white p-1 shadow-sm"
      >
        {([
          ["overview", "Обзор"],
          ["data", "Данные"],
          ["settings", "Настройки"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSection(key)}
            aria-current={activeSection === key ? "page" : undefined}
            className={`min-h-11 rounded-xl px-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:px-4 ${
              activeSection === key
                ? "bg-ink text-white shadow-sm"
                : "text-stone-500 hover:bg-stone-50 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className={`grid gap-6 ${activeSection === "overview" ? "xl:grid-cols-[0.8fr_1.2fr]" : ""}`}>
        {activeSection === "overview" ? (
          <section
            className="self-start rounded-[30px] bg-ink p-7 text-white shadow-soft"
            data-testid="student-profile-summary"
          >
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
              ) : initials}
            </div>
            <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
            <p className="mt-2 text-sm text-white/45">Ученик Maestro</p>
            <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
              <div className="flex items-center gap-3 text-white/60"><GraduationCap size={16} className="text-gold" /> {offlineGroups.length ? offlineGroups.map((item) => item.name).join(", ") : "Учебные группы пока не подключены"}</div>
              <div className="flex items-center gap-3 text-white/60"><BookOpen size={16} className="text-gold" /> {directions.length ? directions.map((item) => item.title).join(", ") : "Онлайн-курсы пока не начаты"}</div>
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
        ) : null}
        <section className="space-y-5" data-testid={`profile-section-${activeSection}`}>
          {activeSection === "overview" ? (
            <>
              {level ? <LevelSummary progress={level} /> : null}
              {economy?.economyV2Enabled ? <EconomyProfileSummary economy={economy} /> : null}
              {achievements ? <ProfileAchievements achievements={achievements} /> : null}
              {school ? (
                <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Школа Maestro</p>
                  <h3 className="font-display mt-3 text-3xl">Абонемент и оплата</h3>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-stone-50 p-5">
                      <WalletCards size={18} className="text-gold" />
                      <p className="font-display mt-3 text-3xl">
                        {school.balanceSnapshot.accountBalanceKzt.toLocaleString("ru-RU")} ₸
                      </p>
                      <p className="mt-1 text-xs text-stone-500">на вашем балансе</p>
                    </div>
                  </div>
                  <Link href="/school-lessons" className="mt-5 inline-flex rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white">
                    Открыть уроки и отчёты
                  </Link>
                </div>
              ) : null}
              <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Обучение</p>
                <div className={`mt-6 grid gap-4 ${economy?.economyV2Enabled ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                  <div className="rounded-2xl bg-stone-50 p-5">
                    <GraduationCap size={18} className="text-gold" />
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Онлайн-курсы</p>
                    <p className="font-display mt-3 text-2xl">{directions.length || 0}</p>
                  </div>
                  {economy?.economyV2Enabled ? (
                    <div className="rounded-2xl bg-stone-50 p-5">
                      <Star size={18} className="text-gold" />
                      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Учебные группы</p>
                      <p className="font-display mt-3 text-2xl">{offlineGroups.length}</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl bg-stone-50 p-5">
                        <Star size={18} className="text-gold" />
                        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Баллы</p>
                        <p className="font-display mt-3 text-2xl">{(profile.points ?? 0).toLocaleString("ru-RU")}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-5">
                        <Coins size={18} className="text-gold" />
                        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-700">Бонусы Maestro</p>
                        <p className="font-display mt-3 text-2xl text-amber-950">{(profile.coins ?? 0).toLocaleString("ru-RU")}</p>
                        <p className="mt-2 text-xs leading-5 text-amber-800">Для обмена на награды; на уровень не влияют</p>
                      </div>
                    </>
                  )}
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
                    <p className="text-sm text-stone-500">Вы ещё не начали ни одного курса.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {activeSection === "data" ? (
            <>
              <ProfileEditCard
                profile={profile}
                onSaved={async () => {
                  await Promise.all([resource.reload(), refreshUser()]);
                }}
              />
              {user.productFeatures?.curatorWorkspaceV2 ? <ParentVisibilityRequestCard /> : null}
            </>
          ) : null}

          {activeSection === "settings" ? (
            <>
              <AndroidAppDownloadCard />
              <PwaInstallCard />
              <PushNotificationsCard />
              <PasswordChangeCard />
              <ImprovementSuggestionCard />
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}

const parentVisibilityOptions: Array<{ key: keyof ParentVisibility; label: string }> = [
  { key: "showSchedule", label: "Расписание" },
  { key: "showBalance", label: "Баланс" },
  { key: "showPlanProgress", label: "План месяца" },
  { key: "showAchievements", label: "Достижения" },
];

function ParentVisibilityRequestCard() {
  const resource = useApiResource(() => familyApi.myVisibility(), []);
  const [requested, setRequested] = useState<ParentVisibility | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) setRequested(resource.data.pendingRequest?.requested ?? resource.data.policy);
  }, [resource.data]);

  if (resource.loading) return <LoadingState label="Загружаем семейный доступ" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!requested) return null;

  const pending = resource.data?.pendingRequest;
  const unchanged = resource.data
    ? parentVisibilityOptions.every((item) => requested[item.key] === resource.data!.policy[item.key])
    : true;
  async function submit() {
    if (!requested || pending) return;
    setBusy(true);
    setMessage(null);
    try {
      await familyApi.requestVisibility(requested, note);
      setNote("");
      setMessage("Запрос отправлен администратору");
      await resource.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить запрос");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="parent-visibility-student">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Семейный доступ</p>
      <h3 className="font-display mt-2 text-3xl">Что видят родители</h3>
      <p className="mt-2 text-sm leading-6 text-stone-500">
        Выберите желаемые разделы и отправьте запрос. Изменения применит администратор для всех привязанных родителей.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {parentVisibilityOptions.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-3 border-t border-stone-200 py-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={requested[item.key]}
              disabled={Boolean(pending)}
              onChange={(event) => setRequested({ ...requested, [item.key]: event.target.checked })}
              className="h-5 w-5 accent-[#c59a45]"
            />
            {item.label}
          </label>
        ))}
      </div>
      {pending ? (
        <p className="mt-4 border-l-4 border-gold bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          Запрос отправлен и ожидает решения администратора.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Комментарий администратору <span className="font-medium normal-case tracking-normal text-stone-400">(необязательно)</span>
            <textarea
              value={note}
              name="parentVisibilityNote"
              autoComplete="off"
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Добавьте пояснение, если нужно…"
              className="mt-2 w-full resize-y rounded-2xl border border-stone-200 px-4 py-3 text-sm normal-case tracking-normal outline-none transition-colors focus:border-gold focus-visible:ring-2 focus-visible:ring-amber-100"
            />
          </label>
          <button type="button" disabled={busy || unchanged} onClick={() => void submit()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50 sm:w-fit"><Send size={16} />{unchanged ? "Изменений нет" : "Отправить запрос"}</button>
        </div>
      )}
      {message ? <p aria-live="polite" className="mt-3 text-sm font-semibold text-stone-600">{message}</p> : null}
    </section>
  );
}

function EconomyProfileSummary({
  economy,
}: {
  economy: NonNullable<Awaited<ReturnType<typeof api.studentEconomyProfile>>>;
}) {
  const earnedCount = economy.milestones.filter((milestone) => milestone.earned).length;
  return (
    <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="economy-profile-summary">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Активность</p>
          <h3 className="font-display mt-2 text-3xl">Серия и медали</h3>
        </div>
        <Link href="/league" className="text-sm font-bold text-stone-600 hover:text-gold">Открыть лигу</Link>
      </div>
      <div className="mt-6 grid divide-y divide-stone-200 border-y border-stone-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="py-4 sm:px-4 sm:first:pl-0">
          <Coins size={18} className="text-gold" />
          <p className="font-display mt-2 text-3xl">{economy.coins.toLocaleString("ru-RU")}</p>
          <p className="text-xs font-bold text-stone-500">Coins</p>
        </div>
        <div className="py-4 sm:px-4">
          <Flame size={18} className="text-gold" />
          <p className="font-display mt-2 text-3xl">{economy.streak?.currentWeeks ?? 0}</p>
          <p className="text-xs font-bold text-stone-500">текущая серия</p>
        </div>
        <div className="py-4 sm:px-4 sm:last:pr-0">
          <Award size={18} className="text-gold" />
          <p className="font-display mt-2 text-3xl">{earnedCount} / {economy.milestones.length}</p>
          <p className="text-xs font-bold text-stone-500">медалей · лучшая серия {economy.streak?.bestWeeks ?? 0}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {economy.milestones.map((milestone) => (
          <div key={milestone.weeks} className={`min-w-0 border-t-2 pt-3 text-center ${milestone.earned ? "border-gold text-ink" : "border-stone-200 text-stone-400"}`}>
            <p className="font-display text-xl">{milestone.weeks}</p>
            <p className="mt-1 truncate text-[10px] font-bold">недель</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfileAchievements({
  achievements,
}: {
  achievements: Awaited<ReturnType<typeof api.achievements>>;
}) {
  const [showAll, setShowAll] = useState(false);
  const earnedCount = achievements.meta?.earnedCount
    ?? achievements.data.filter((achievement) => achievement.earned).length;
  const totalCount = achievements.meta?.totalCount ?? achievements.data.length;

  return (
    <section id="achievements" className="scroll-mt-24 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="profile-achievements">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Учебный путь</p>
          <h3 className="font-display mt-2 text-3xl">Достижения</h3>
          <p className="mt-2 text-sm text-stone-500">Получено {earnedCount} из {totalCount}</p>
        </div>
        {achievements.data.length > 4 ? (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="min-h-10 text-sm font-bold text-stone-600 hover:text-gold"
            aria-expanded={showAll}
          >
            {showAll ? "Свернуть" : "Показать все"}
          </button>
        ) : null}
      </div>
      <div className="mt-5">
        <AchievementsWall achievements={achievements.data} compact={!showAll} />
      </div>
    </section>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function ProfileEditCard({
  profile,
  onSaved,
}: {
  profile: {
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    phone?: string | null;
    avatar?: string | null;
  };
  onSaved: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [middleName, setMiddleName] = useState(profile.middleName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avatarSyncNotice, setAvatarSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setMiddleName(profile.middleName ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(false);
    setAvatarSyncNotice(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Загрузите JPG, PNG или WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Фото должно быть до 5 МБ");
      return;
    }

    setUploadingAvatar(true);
    try {
      const updated = await api.uploadAvatar({
        filename: file.name,
        mimeType: file.type,
        base64: await fileToBase64(file),
      });
      await onSaved();
      setSuccess(true);
      if (updated.avatarSyncStatus === "failed") {
        setAvatarSyncNotice("Фото сохранено. В школьном профиле оно обновится позже.");
      } else if (updated.avatarSyncStatus === "not_linked") {
        setAvatarSyncNotice("Фото профиля сохранено.");
      } else {
        setAvatarSyncNotice("Фото профиля обновлено.");
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось загрузить фото");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await api.updateProfile({
        firstName,
        lastName,
        middleName: middleName.trim() || null,
        phone,
      });
      await onSaved();
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Личные данные</p>
      <h3 className="font-display mt-3 text-3xl">Профиль ученика</h3>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-stone-100 text-lg font-bold text-stone-400">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound size={26} />
          )}
        </div>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-ink transition-colors hover:border-gold/50 hover:text-gold focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold">
          {uploadingAvatar ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
          {uploadingAvatar ? "Загружаем фото" : "Загрузить фото"}
          <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} className="sr-only" />
        </label>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Фамилия" value={lastName} onChange={setLastName} maxLength={128} required />
          <TextField label="Имя" value={firstName} onChange={setFirstName} maxLength={128} required />
        </div>
        <TextField label="Отчество" value={middleName} onChange={setMiddleName} maxLength={128} />
        <TextField label="Телефон" value={phone} onChange={setPhone} maxLength={32} required />
        <p className="-mt-2 text-xs leading-5 text-stone-400">
          Эти данные используются в приложении. Фото также обновится в основной карточке ученика.
        </p>
        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {avatarSyncNotice && <p aria-live="polite" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{avatarSyncNotice}</p>}
        {success && <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">Профиль сохранён</p>}
        <button
          disabled={saving || uploadingAvatar}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60 sm:w-fit"
        >
          {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
          {saving ? "Сохраняем" : "Сохранить изменения"}
        </button>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{label}</span>
      <input
        name={label === "Телефон" ? "phone" : label === "Фамилия" ? "lastName" : label === "Имя" ? "firstName" : "middleName"}
        type={label === "Телефон" ? "tel" : "text"}
        autoComplete={label === "Телефон" ? "tel" : label === "Фамилия" ? "family-name" : label === "Имя" ? "given-name" : "additional-name"}
        required={required}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-gold focus-visible:ring-2 focus-visible:ring-amber-100"
      />
    </label>
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
          <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-1 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-amber-100">
            <input
              name="currentPassword"
              type={showCurrent ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={() => setShowCurrent((c) => !c)} aria-label={showCurrent ? "Скрыть пароль" : "Показать пароль"} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
              {showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Новый пароль</span>
          <span className="flex items-center rounded-2xl border border-stone-200 bg-white pr-1 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-amber-100">
            <input
              name="newPassword"
              type={showNew ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={() => setShowNew((c) => !c)} aria-label={showNew ? "Скрыть пароль" : "Показать пароль"} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
              {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
          <span className="mt-2 block text-xs text-stone-400">От 8 до 72 символов</span>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">Подтвердите новый пароль</span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-gold focus-visible:ring-2 focus-visible:ring-amber-100"
          />
        </label>
        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {success && <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">Пароль успешно изменён</p>}
        <button
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60"
        >
          {submitting ? (
            <>
              <LoaderCircle size={17} className="animate-spin" /> Сохраняем…
            </>
          ) : (
            "Сменить пароль"
          )}
        </button>
      </form>
    </div>
  );
}
