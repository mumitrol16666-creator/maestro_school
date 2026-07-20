"use client";

import { KeyRound, LogOut, Mail, Phone, Shield, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { PushNotificationsCard } from "@/components/push-notifications-card";
import { AndroidAppDownloadCard } from "@/components/android-app-download";
import { useApiResource } from "@/hooks/use-api-resource";
import { api, storeSession, getAccessToken } from "@/lib/api-client";
import { formatFio, initialsFromName } from "@/lib/name";
import { permissionLabel, roleDescription, roleLabel } from "@/lib/role-labels";

export default function AdminSettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const resource = useApiResource(() => api.me(), []);
  const [phone, setPhone] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const profile = { ...user, ...resource.data };

  useEffect(() => {
    if (!profile.phone || profile.phone === "00000000000") return;
    setPhone(profile.phone);
  }, [profile.phone]);

  if (resource.loading) return <LoadingState label="Загружаем настройки аккаунта" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  const fullName = formatFio(profile) || profile.email || "Администратор";
  const initials = initialsFromName(profile);
  const permissions = profile.permissions ?? [];

  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    setPhoneBusy(true);
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      if (!phone.trim()) {
        setPhoneError("Укажите номер телефона");
        return;
      }
      const updated = await api.updateProfile({ phone });
      await refreshUser();
      const token = getAccessToken();
      if (token) storeSession(token, updated);
      setPhoneMessage("Телефон обновлён");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Не удалось сохранить телефон");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Личный кабинет"
        title="Настройки аккаунта"
        description="Контакты, пароль, уведомления и доступные вам разделы."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[30px] bg-ink p-7 text-white shadow-soft">
          <div className="grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-white/10 font-display text-2xl text-gold">
            {initials}
          </div>
          <h2 className="font-display mt-7 text-4xl">{fullName}</h2>
          <p className="mt-2 text-sm text-white/45">{roleLabel(profile.role)}</p>
          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
            <div className="flex items-center gap-3 text-white/60">
              <UserRound size={16} className="text-gold" />
              Логин: {profile.login ?? "—"}
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <Mail size={16} className="text-gold" />
              {profile.email}
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <Phone size={16} className="text-gold" />
              {profile.phone && profile.phone !== "00000000000" ? profile.phone : "Телефон не указан"}
            </div>
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
          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <div className="flex items-center gap-3">
              <KeyRound size={18} className="text-gold" />
              <div>
                <h2 className="font-display text-2xl">Смена пароля</h2>
                <p className="mt-1 text-sm text-stone-500">Используйте новый пароль при следующем входе.</p>
              </div>
            </div>
            <div className="mt-6">
              <ChangePasswordForm />
            </div>
          </div>

          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Контакты</p>
            <form onSubmit={savePhone} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Телефон</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+7 999 000-00-00"
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={phoneBusy}
                className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                Сохранить телефон
              </button>
              {phoneMessage ? <p className="text-sm font-semibold text-emerald-700">{phoneMessage}</p> : null}
              {phoneError ? <p className="text-sm font-semibold text-red-600">{phoneError}</p> : null}
            </form>
          </div>

          <AndroidAppDownloadCard />
          <PushNotificationsCard />

          <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-gold" />
              <div>
                <h2 className="font-display text-2xl">Что вам доступно</h2>
                <p className="mt-1 text-sm text-stone-500">{roleDescription(profile.role)}</p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
              <p><span className="font-bold text-ink">Ваш уровень доступа:</span> {roleLabel(profile.role)}</p>
            </div>
            {permissions.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {permissions.map((code) => (
                  <li key={code} className="rounded-xl border border-stone-100 bg-white px-3 py-2 text-xs font-semibold text-stone-600">
                    {permissionLabel(code)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
