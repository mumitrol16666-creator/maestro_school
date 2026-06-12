"use client";

import { ArrowRight, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageControls } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatPhoneDisplay } from "@/lib/phone";
import { studentsApi } from "@/lib/students-api";

export default function AdminStudentsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const resource = useApiResource(
    () => studentsApi.list({ search: search || undefined, page, limit: 20 }),
    [search, page],
  );

  return (
    <>
      <PageHeader
        eyebrow="Ученики"
        title="База учеников"
        description="Прогресс, баллы, Maestro Coins и достижения каждого ученика школы."
      />

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <Search size={16} className="text-stone-400" />
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Поиск по имени, логину, телефону или email"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {resource.loading && !resource.data ? <LoadingState label="Загружаем учеников" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

      {resource.data && !resource.data.data?.length ? (
        <EmptyState title="Ученики не найдены" description="Попробуйте изменить поисковый запрос." />
      ) : null}

      <div className="space-y-3">
        {resource.data?.data?.map((student) => (
          <Link
            key={student.id}
            href={`/admin/students/${student.id}`}
            className="card-hover flex items-center gap-4 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-gold">
              <Users size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl">{student.firstName} {student.lastName}</h2>
              <p className="mt-1 text-sm font-semibold text-ink">{formatPhoneDisplay(student.phone)}</p>
              <p className="mt-1 text-xs text-stone-500">@{student.login} · {student.email}</p>
              <p className="mt-2 text-sm text-stone-500">
                {student.points} баллов · {student.coins} Coins · {student.completedLessons} уроков
              </p>
            </div>
            <ArrowRight size={18} className="text-gold" />
          </Link>
        ))}
      </div>

      {resource.data?.meta && resource.data.meta.pages > 1 && (
        <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />
      )}
    </>
  );
}
