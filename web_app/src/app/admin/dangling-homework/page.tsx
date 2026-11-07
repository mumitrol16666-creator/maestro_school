"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiRequest } from "@/lib/api-client";

type DanglingHomework = {
  recipientId: string;
  crmStudentId: string;
  studentName: string;
  studentUserId: string | null;
  directionTitle: string;
  topicTitle: string;
  sector: number | null;
  instructions: string;
  state: "assigned" | "waiting_review" | "revision";
  assignedAt: string;
  reason: "sector_closed" | "older_open_sector" | "topic_moved" | "no_sector" | "topic_removed";
  reasonText: string;
};

const stateLabel: Record<DanglingHomework["state"], string> = {
  assigned: "Задано",
  waiting_review: "Ученик отправил",
  revision: "На доработке",
};

const reasonFilters: Array<{ value: DanglingHomework["reason"] | ""; label: string }> = [
  { value: "", label: "Все" },
  { value: "sector_closed", label: "Сектор закрыт" },
  { value: "older_open_sector", label: "Сектор ждёт экзамена" },
  { value: "topic_moved", label: "Тема убрана" },
  { value: "no_sector", label: "Вне сектора" },
  { value: "topic_removed", label: "Тема удалена" },
];

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/**
 * 07.11: open homework of pupils that no lesson shows for checking — the pupil still sees it as
 * «задано». Grouped by pupil so the admin can decide what to do with each.
 */
export default function DanglingHomeworkPage() {
  const resource = useApiResource(() => apiRequest<DanglingHomework[]>("/admin/homework/dangling"), []);
  const [reason, setReason] = useState<DanglingHomework["reason"] | "">("");
  const rows = useMemo(
    () => (resource.data ?? []).filter((row) => !reason || row.reason === reason),
    [resource.data, reason],
  );
  const byStudent = useMemo(() => {
    const groups = new Map<string, DanglingHomework[]>();
    for (const row of rows) groups.set(row.crmStudentId, [...(groups.get(row.crmStudentId) ?? []), row]);
    return [...groups.values()];
  }, [rows]);

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Учебный контроль"
        title="Висячие ДЗ"
        description="Задания, которые ученик видит открытыми, а урок не покажет преподавателю к проверке. Причина указана у каждого."
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Причина">
        {reasonFilters.map((item) => (
          <button
            key={item.value || "all"}
            type="button"
            onClick={() => setReason(item.value)}
            aria-pressed={reason === item.value}
            className={`min-h-10 rounded-full border px-4 text-sm font-bold ${reason === item.value ? "border-ink bg-ink text-white" : "border-stone-300 bg-white text-stone-800"}`}
          >
            {item.label}
            {resource.data ? ` · ${item.value ? resource.data.filter((row) => row.reason === item.value).length : resource.data.length}` : ""}
          </button>
        ))}
      </div>
      {resource.loading ? <LoadingState label="Собираем открытые задания" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={() => void resource.reload()} /> : null}
      {resource.data && !rows.length ? (
        <EmptyState title="Висячих ДЗ нет" description="Все открытые задания учеников попадают на уроки к проверке." />
      ) : null}
      {byStudent.map((items) => (
        <section key={items[0].crmStudentId} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="text-base font-bold">
            {items[0].studentUserId ? (
              <Link href={`/admin/students/${items[0].studentUserId}`} className="underline underline-offset-4">{items[0].studentName}</Link>
            ) : items[0].studentName}
            <span className="ml-2 text-sm font-semibold text-stone-500">{items.length}</span>
          </h2>
          <ul className="grid gap-2">
            {items.map((row) => (
              <li key={row.recipientId} className="grid gap-1 rounded-xl bg-stone-50 p-3 text-sm">
                <p className="font-semibold">
                  {row.directionTitle} · {row.sector ? `сектор ${row.sector} · ` : ""}{row.topicTitle}
                </p>
                <p className="text-stone-700">{row.instructions}</p>
                <p className="text-xs text-stone-500">
                  {stateLabel[row.state]} · задано {dateFormat.format(new Date(row.assignedAt))}
                </p>
                <p className="text-xs font-semibold text-amber-800">{row.reasonText}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
