"use client";

import { ArrowRight, Search, UserCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageControls } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { useApiResource } from "@/hooks/use-api-resource";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/role-labels";
import { formatPhoneDisplay } from "@/lib/phone";
import { usersApi } from "@/lib/users-api";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const initialRole = new URLSearchParams(window.location.search).get("role");
    if (initialRole) setRole(initialRole);
  }, []);

  const resource = useApiResource(
    () => usersApi.list({ search: search || undefined, role: role || undefined, page, limit: 20 }),
    [search, role, page],
  );

  return (
    <>
      <PageHeader
        eyebrow="Доступ"
        title="Пользователи и роли"
        description="Назначайте роли сотрудникам школы: преподаватель, администратор, ученик."
      />

      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <Search size={16} className="text-stone-400" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Поиск по имени, логину, телефону или email"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={role}
          onChange={(event) => { setRole(event.target.value); setPage(1); }}
          className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none"
        >
          <option value="">Все роли</option>
          {ASSIGNABLE_ROLES.map((slug) => (
            <option key={slug} value={slug}>{roleLabel(slug)}</option>
          ))}
        </select>
      </div>

      {resource.loading && !resource.data ? <LoadingState label="Загружаем пользователей" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

      {resource.data && !resource.data.data?.length ? (
        <EmptyState title="Пользователи не найдены" description="Попробуйте изменить поиск или фильтр по роли." />
      ) : null}

      <div className="space-y-3">
        {resource.data?.data?.map((item) => (
          <Link
            key={item.id}
            href={`/admin/users/${item.id}`}
            className="card-hover flex items-center gap-4 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-gold">
              <UserCog size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl">{item.firstName} {item.lastName}</h2>
                <RoleBadge role={item.role} />
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">{formatPhoneDisplay(item.phone)}</p>
              <p className="mt-1 text-xs text-stone-500">@{item.login} · {item.email}</p>
            </div>
            <ArrowRight size={18} className="text-gold" />
          </Link>
        ))}
      </div>

      {resource.data?.meta && resource.data.meta.pages > 1 ? (
        <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />
      ) : null}
    </>
  );
}
