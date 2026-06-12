"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Пароль успешно изменён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить пароль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Текущий пароль</label>
        <div className="flex items-center rounded-2xl border border-stone-200 bg-white px-4">
          <input
            type={showPasswords ? "text" : "password"}
            required
            minLength={8}
            maxLength={72}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="min-w-0 flex-1 py-3.5 text-sm outline-none"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Новый пароль</label>
          <input
            type={showPasswords ? "text" : "password"}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Подтверждение</label>
          <input
            type={showPasswords ? "text" : "password"}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
          Сохранить пароль
        </button>
        <button
          type="button"
          onClick={() => setShowPasswords((value) => !value)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-ink"
        >
          {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
          {showPasswords ? "Скрыть" : "Показать"} пароли
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
      {success ? <p className="text-sm font-semibold text-emerald-700">{success}</p> : null}
    </form>
  );
}
