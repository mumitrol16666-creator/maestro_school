"use client";

import { ArrowRight, Search, UserRound, UsersRound, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { useAuth } from "@/components/auth-provider";
import { PageControls } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { formatFio } from "@/lib/name";
import { onlineLessonStatusClasses, onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { formatPhoneDisplay } from "@/lib/phone";
import { onlineLessonsApi } from "@/lib/online-lessons-api";
import type { OnlineLessonRequest } from "@/types/online-lessons";

const filters = [
  { value: "", label: "Все" },
  { value: "new", label: "Новые" },
  { value: "assigned", label: "Уроки в работе" },
  { value: "scheduled", label: "Назначены" },
  { value: "completed", label: "Завершены" },
] as const;

export default function AdminOnlineLessonsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [teacherFilter, setTeacherFilter] = useState("");
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const { counts } = usePendingOnlineLessonsCount();

  const resource = useApiResource(
    () => onlineLessonsApi.adminList({
      status: status || undefined,
      search: search || undefined,
      teacherId: !isTeacher && teacherFilter && teacherFilter !== "unassigned" ? teacherFilter : undefined,
      unassigned: !isTeacher && teacherFilter === "unassigned",
      page,
      limit: 20,
    }),
    [status, search, teacherFilter, page, isTeacher],
  );
  const teachersResource = useApiResource(
    () => (isTeacher ? Promise.resolve([]) : onlineLessonsApi.teachers()),
    [isTeacher],
  );
  const groupedRequests = Array.from((resource.data?.data ?? []).reduce((groups, item) => {
    const key = item.teacher?.id ?? "unassigned";
    const group = groups.get(key) ?? {
      key,
      name: item.teacher ? formatFio(item.teacher) : "Преподаватель не назначен",
      items: [] as OnlineLessonRequest[],
    };
    group.items.push(item);
    groups.set(key, group);
    return groups;
  }, new Map<string, {
    key: string;
    name: string;
    items: OnlineLessonRequest[];
  }>()).values());

  return (
    <>
      <PageHeader
        eyebrow="Живые занятия"
        title={isTeacher ? "Мои онлайн-уроки" : "Онлайн-уроки школы"}
        description={
          isTeacher
            ? "Ваши назначенные онлайн-уроки, завершённые занятия и домашние задания."
            : "Все онлайн-уроки школы по преподавателям: назначение, проведение, завершение и история."
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.label}
            onClick={() => { setStatus(item.value); setPage(1); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${
              status === item.value ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
            }`}
          >
            {item.label}
            {item.value === "new" && counts && counts.newRequests > 0 && (
              <AdminPendingHomeworkBadge count={counts.newRequests} />
            )}
            {item.value === "assigned" && counts && counts.myInWork > 0 && (
              <AdminPendingHomeworkBadge count={counts.myInWork} />
            )}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <Search size={16} className="text-stone-400" />
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Поиск по ученику или направлению"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {!isTeacher ? (
        <div className="mb-6 rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm">
          <label className="block text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
            Преподаватель
            <select
              value={teacherFilter}
              onChange={(event) => {
                setTeacherFilter(event.target.value);
                setPage(1);
              }}
              className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink outline-none focus:border-gold sm:max-w-md"
            >
              <option value="">Все преподаватели</option>
              {teachersResource.data?.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{formatFio(teacher)}</option>
              ))}
              <option value="unassigned">Не назначен</option>
            </select>
          </label>
        </div>
      ) : null}

      {resource.loading && !resource.data ? <LoadingState label="Загружаем заявки" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

      {resource.data && !resource.data.data?.length ? (
        <EmptyState title="Заявок нет" description="Новые заявки появятся, когда ученики запишутся на онлайн-урок." />
      ) : null}

      <div className="space-y-9">
        {groupedRequests.map((group) => (
          <section key={group.key}>
            {!isTeacher ? (
              <div className="mb-3 flex min-w-0 items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                  group.key === "unassigned" ? "bg-amber-100 text-amber-900" : "bg-ink text-white"
                }`}>
                  {group.key === "unassigned" ? <UserRound size={18} /> : <UsersRound size={18} />}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-2xl">{group.name}</h2>
                  <p className="text-xs font-semibold text-stone-400">
                    {group.items.length} {group.items.length === 1 ? "урок" : "уроков"}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="space-y-3">
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/online-lessons/${item.id}`}
                  className="card-hover flex min-w-0 items-center gap-3 rounded-[24px] border border-stone-200 bg-paper p-4 shadow-soft sm:gap-4 sm:p-5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700 sm:h-12 sm:w-12">
                    <Video size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate font-display text-lg sm:text-xl">{formatFio(item.student)}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:text-xs ${onlineLessonStatusClasses[item.status]}`}>
                        {onlineLessonStatusLabels[item.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-gold">{item.directionTitle} · {item.level}</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{formatPhoneDisplay(item.student.phone)}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-500">{item.preferredTime}</p>
                  </div>
                  <ArrowRight size={18} className="shrink-0 text-gold" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {resource.data?.meta && resource.data.meta.pages > 1 && (
        <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />
      )}
    </>
  );
}
