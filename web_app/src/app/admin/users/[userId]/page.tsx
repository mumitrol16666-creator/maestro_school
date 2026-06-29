"use client";

import { ArrowLeft, LoaderCircle, Shield } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { primaryButton } from "@/components/admin-ui";
import { ErrorState, LoadingState } from "@/components/data-states";
import { RoleBadge } from "@/components/role-badge";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatFio } from "@/lib/name";
import { isContentAdminRole, permissionLabel, roleLabel } from "@/lib/role-labels";
import { formatPhoneDisplay } from "@/lib/phone";
import { usersApi } from "@/lib/users-api";
import { CrmLinkPanel } from "@/components/crm-link-panel";

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { user: currentUser } = useAuth();
  const [selectedRole, setSelectedRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resource = useApiResource(async () => {
    const [user, roles] = await Promise.all([
      usersApi.get(userId),
      usersApi.roles(),
    ]);
    return { user, roles };
  }, [userId]);

  if (resource.loading) return <LoadingState label="Загружаем пользователя" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <ErrorState message="Пользователь не найден" retry={resource.reload} />;

  const { user, roles } = resource.data;
  const fullName = user.fullName || formatFio(user);
  const roleValue = selectedRole || user.role;
  const isSelf = currentUser?.id === user.id;
  const canAssignRoles = isContentAdminRole(currentUser?.role);

  async function saveRole() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await usersApi.updateRole(userId, roleValue);
      setMessage("Роль обновлена. Пользователю нужно перелогиниться.");
      await resource.reload();
      setSelectedRole("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить роль");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/admin/users" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} />
        Все пользователи
      </Link>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl">{fullName}</h1>
            <RoleBadge role={user.role} />
          </div>
          <div className="mt-6 space-y-2 text-sm text-stone-600">
            <p><span className="font-bold text-ink">Логин:</span> @{user.login}</p>
            <p><span className="font-bold text-ink">Email:</span> {user.email}</p>
            <p><span className="font-bold text-ink">Телефон:</span> {formatPhoneDisplay(user.phone)}</p>
            <p><span className="font-bold text-ink">Зарегистрирован:</span> {new Date(user.createdAt).toLocaleDateString("ru-RU")}</p>
          </div>
          {user.role === "student" ? (
            <Link href={`/admin/students/${user.id}`} className="mt-6 inline-flex text-sm font-bold text-gold hover:underline">
              Открыть карточку ученика →
            </Link>
          ) : null}
          </section>

          {(user.role === "student" || user.role === "teacher") ? (
            <CrmLinkPanel
              userId={userId}
              phone={user.phone}
              role={user.role}
              onLinked={resource.reload}
            />
          ) : null}
        </div>

        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-gold" />
            <div>
              <h2 className="font-display text-2xl">Роль доступа</h2>
              <p className="mt-1 text-sm text-stone-500">
                {canAssignRoles
                  ? "Выберите роль и сохраните. Изменение вступит в силу после следующего входа."
                  : "Назначать роли могут только администратор и владелец школы."}
              </p>
            </div>
          </div>

          {isSelf ? (
            <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Свою роль изменить нельзя — попросите другого администратора.
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <select
              value={roleValue}
              disabled={!canAssignRoles || isSelf || busy}
              onChange={(event) => setSelectedRole(event.target.value)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none disabled:opacity-60"
            >
              {roles.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {roleLabel(role.slug)}
                </option>
              ))}
            </select>

            {canAssignRoles && !isSelf ? (
              <button
                type="button"
                disabled={busy || roleValue === user.role}
                onClick={() => void saveRole()}
                className={`${primaryButton} inline-flex items-center gap-2 disabled:opacity-60`}
              >
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
                Сохранить роль
              </button>
            ) : null}

            {message ? <p className="text-sm font-semibold text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          </div>

          <div className="mt-6 rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Права роли</p>
            <ul className="mt-3 space-y-2">
              {user.permissions.map((code) => (
                <li key={code} className="text-sm text-stone-600">{permissionLabel(code)}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
