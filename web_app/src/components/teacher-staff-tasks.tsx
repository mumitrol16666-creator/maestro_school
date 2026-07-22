"use client";

import { AlertCircle, Check, ClipboardCheck, Clock3, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  teacherStaffTasksApi,
  type TeacherStaffTask,
} from "@/lib/teacher-staff-tasks-api";

const priorityLabel: Record<TeacherStaffTask["priority"], string> = {
  low: "Можно позже",
  normal: "Обычная",
  high: "Важно",
  urgent: "Срочно",
};

function formatDueAt(value: string | null) {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value));
}

export function TeacherStaffTasks() {
  const [tasks, setTasks] = useState<TeacherStaffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await teacherStaffTasksApi.list();
      setTasks(result.tasks);
      setError("");
    } catch {
      setError("Не удалось загрузить поручения");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function complete(taskId: string) {
    setCompletingId(taskId);
    setError("");
    try {
      await teacherStaffTasksApi.complete(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      window.dispatchEvent(new Event("maestro:notifications-changed"));
    } catch {
      setError("Не получилось завершить задачу. Попробуйте ещё раз.");
    } finally {
      setCompletingId(null);
    }
  }

  if (loading && tasks.length === 0) {
    return (
      <section className="mb-6 flex min-h-24 items-center justify-center rounded-[28px] border border-amber-200 bg-amber-50/70">
        <Loader2 className="animate-spin text-amber-700" size={20} />
        <span className="ml-2 text-sm font-bold text-amber-900">Проверяем поручения</span>
      </section>
    );
  }

  if (!tasks.length && !error) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-[28px] border border-amber-300 bg-amber-50 shadow-soft">
      <div className="flex items-center gap-3 border-b border-amber-200 px-5 py-4 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-900 text-amber-100">
          <ClipboardCheck size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Поручения</p>
          <h2 className="font-display text-2xl text-ink">
            {tasks.length === 1 ? "Нужно выполнить задачу" : `Нужно выполнить: ${tasks.length}`}
          </h2>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-red-700 sm:px-6">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <div className="divide-y divide-amber-200">
        {tasks.map((task) => {
          const urgent = task.priority === "urgent" || task.priority === "high";
          return (
            <article key={task.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-base font-black text-ink sm:text-lg">{task.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                    urgent ? "bg-red-100 text-red-700" : "bg-white/80 text-amber-800"
                  }`}>
                    {priorityLabel[task.priority]}
                  </span>
                </div>
                {task.description ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{task.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{formatDueAt(task.dueAt)}</span>
                  {task.createdBy?.name ? <span>От: {task.createdBy.name}</span> : null}
                </div>
              </div>
              <button
                type="button"
                disabled={completingId === task.id}
                onClick={() => void complete(task.id)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 lg:w-auto"
              >
                {completingId === task.id ? <Loader2 className="animate-spin" size={17} /> : <Check size={18} />}
                Выполнено
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
