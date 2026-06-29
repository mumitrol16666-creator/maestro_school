"use client";

import { BookOpen, Camera, Coins, Eye, EyeOff, GraduationCap, LoaderCircle, LogOut, Mail, Phone, Save, Star, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
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
  const { user, logout, refreshUser } = useAuth();
  const resource = useApiResource(async () => {
    const [profile, directions, progress, school] = await Promise.all([
      api.me(),
      api.directions(),
      api.progress(),
      api.studentOfflineSummary().catch(() => null),
    ]);
    const activeDirectionIds = new Set(progress.enrollments.map((item) => item.course.directionId));
    return {
      profile,
      directions: directions.filter((item) => activeDirectionIds.has(item.id)),
      courses: progress.enrollments.map((item) => item.course),
      school,
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
  const school = resource.data?.school;
  const offlineGroups = school?.profile.groups ?? [];

  return (
    <>
      <PageHeader eyebrow="Личный кабинет" title="Профиль" description="Ваши данные и активное обучение в Maestro." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-[30px] bg-ink p-7 text-white shadow-soft">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
            ) : initials}
          </div>
          <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
          <p className="mt-2 text-sm text-white/45">Ученик Maestro</p>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center gap-3 text-white/60"><GraduationCap size={16} className="text-gold" /> {offlineGroups.length ? offlineGroups.map((item) => item.name).join(", ") : "Офлайн-группы пока не подключены"}</div>
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
        <section className="space-y-5">
          <ProfileEditCard
            profile={profile}
            onSaved={async () => {
              await Promise.all([resource.reload(), refreshUser()]);
            }}
          />
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
          <PwaInstallCard />
          <PushNotificationsCard />
          <PasswordChangeCard />
          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Обучение</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-stone-50 p-5">
                <GraduationCap size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Онлайн-курсы</p>
                <p className="font-display mt-3 text-2xl">{directions.length || 0}</p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-5">
                <Star size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">Баллы</p>
                <p className="font-display mt-3 text-2xl">{(profile.points ?? 0).toLocaleString("ru-RU")}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-5">
                <Coins size={18} className="text-gold" />
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-700">Бонусы Maestro</p>
                <p className="font-display mt-3 text-2xl text-amber-950">{(profile.coins ?? 0).toLocaleString("ru-RU")}</p>
                <p className="mt-2 text-xs leading-5 text-amber-800">Награда от преподавателя после онлайн-уроков и домашних заданий</p>
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
    phone?: string | null;
    avatar?: string | null;
    profileBio?: string | null;
    profileInstrument?: string | null;
    profileInterests?: string[];
    profilePublic?: boolean;
  };
  onSaved: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [profileBio, setProfileBio] = useState(profile.profileBio ?? "");
  const [profileInstrument, setProfileInstrument] = useState(profile.profileInstrument ?? "");
  const [profileInterests, setProfileInterests] = useState((profile.profileInterests ?? []).join(", "));
  const [profilePublic, setProfilePublic] = useState(profile.profilePublic ?? false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avatarSyncNotice, setAvatarSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setPhone(profile.phone ?? "");
    setProfileBio(profile.profileBio ?? "");
    setProfileInstrument(profile.profileInstrument ?? "");
    setProfileInterests((profile.profileInterests ?? []).join(", "));
    setProfilePublic(profile.profilePublic ?? false);
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
        setAvatarSyncNotice("Фото сохранено в приложении. CRM временно не ответила, синхронизацию можно повторить позже.");
      } else if (updated.avatarSyncStatus === "not_linked") {
        setAvatarSyncNotice("Фото сохранено в приложении. Аккаунт пока не связан с CRM.");
      } else {
        setAvatarSyncNotice("Фото сохранено и отправлено в CRM.");
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
        phone,
        profileBio,
        profileInstrument,
        profileInterests: profileInterests
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        profilePublic,
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
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Моя карточка</p>
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-ink transition hover:border-gold/50 hover:text-gold">
          {uploadingAvatar ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
          {uploadingAvatar ? "Загружаем фото" : "Загрузить фото"}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} className="hidden" />
        </label>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Имя" value={firstName} onChange={setFirstName} maxLength={128} required />
          <TextField label="Фамилия" value={lastName} onChange={setLastName} maxLength={128} required />
        </div>
        <TextField label="Телефон" value={phone} onChange={setPhone} maxLength={32} required />
        <p className="-mt-2 text-xs leading-5 text-stone-400">
          Эти данные используются в приложении. В CRM из этой карточки отправляется только фото.
        </p>
        <TextField label="Инструмент" value={profileInstrument} onChange={setProfileInstrument} maxLength={128} />
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">О себе</span>
          <textarea
            value={profileBio}
            onChange={(event) => setProfileBio(event.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
          />
        </label>
        <TextField label="Интересы" value={profileInterests} onChange={setProfileInterests} maxLength={240} placeholder="фортепиано, вокал, джаз" />
        <label className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
          <input
            type="checkbox"
            checked={profilePublic}
            onChange={(event) => setProfilePublic(event.target.checked)}
            className="mt-1 h-4 w-4 accent-ink"
          />
          <span>
            <span className="block text-sm font-bold text-ink">Публичная карточка</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">Подготовить карточку для будущей стены и общего чата учеников.</span>
          </span>
        </label>
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {avatarSyncNotice && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{avatarSyncNotice}</p>}
        {success && <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">Профиль сохранён</p>}
        <button
          disabled={saving || uploadingAvatar}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-60"
        >
          {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
          {saving ? "Сохраняем" : "Сохранить карточку"}
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
        required={required}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
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
