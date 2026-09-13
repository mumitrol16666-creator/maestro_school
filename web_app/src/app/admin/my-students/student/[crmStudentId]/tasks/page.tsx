"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ClipboardList } from "lucide-react";
import { useApiResource } from "@/hooks/use-api-resource";
import { taskDate } from "@/lib/task-presentation";
import { ApiError } from "@/lib/api-client";
import { teacherHomeworkApi, type LegacyDecision, type TeacherHomeworkItem } from "@/lib/teacher-student-homework-api";

type Tab = "current" | "review" | "clarify" | "history";
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "current", label: "Текущие" }, { key: "review", label: "На проверке" },
  { key: "clarify", label: "Уточнить результат" }, { key: "history", label: "История" },
];
const decisions: Array<{ key: LegacyDecision; label: string }> = [
  { key: "accepted", label: "Принято" }, { key: "continue", label: "Продолжить работу" }, { key: "obsolete", label: "Неактуально" },
];
const labels: Record<string, string> = {
  assigned: "Нужно сделать", waiting_review: "На проверке", revision: "Доработать", needs_revision: "Доработать",
  accepted: "Принято", accepted_with_comment: "Принято с замечанием", continue: "Продолжить работу",
  obsolete: "Неактуально", clarify: "Результат не отмечен",
};
const control = "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700";
function tabFor(item: TeacherHomeworkItem): Tab {
  if (["accepted", "accepted_with_comment", "obsolete"].includes(item.state)) return "history";
  if (item.state === "waiting_review") return "review";
  if (item.state === "clarify") return "clarify";
  return "current";
}

export default function TeacherStudentTasksPage() {
  const { crmStudentId } = useParams<{ crmStudentId: string }>();
  const resource = useApiResource(() => teacherHomeworkApi.list(crmStudentId), [crmStudentId]);
  const [tab, setTab] = useState<Tab>("current");
  const [message, setMessage] = useState<string | null>(null);
  const data = resource.data?.student.crmStudentId === crmStudentId ? resource.data : null;
  const items = data?.items ?? [];
  return <div className="mx-auto w-full max-w-6xl" data-testid="teacher-student-tasks">
    <Link href="/admin/my-students" className={`${control} mb-4 inline-flex items-center gap-2 pl-0 text-stone-600`}><ArrowLeft size={16} /> Мои ученики</Link>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">Задания ученика</h1>
        {data && <p className="mt-2 break-words text-base font-semibold text-stone-700">{data.student.name}</p>}
        <p className="mt-1 text-sm leading-6 text-stone-500">Назначения, ответы и результаты — в одном месте.</p>
      </div>
      {data?.planHref && <Link href={data.planHref} className={`${control} border border-stone-200 bg-white`}>Учебный план →</Link>}
    </header>
    {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {resource.loading ? <p role="status" className="py-5 text-sm text-stone-600">Загружаем задания…</p> : resource.error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm">{resource.error}</p><button className={`${control} mt-2 border border-amber-300`} onClick={resource.reload}>Повторить</button>
    </div> : <>
      <div aria-label="Состояние заданий" className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-white p-1 sm:grid-cols-4">
        {tabs.map(item => <button key={item.key} aria-pressed={tab === item.key} onClick={() => { setTab(item.key); setMessage(null); }} className={`${control} flex flex-wrap items-center justify-center gap-2 px-2 ${tab === item.key ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}>
          {item.label}<span className={`rounded-full px-2 py-0.5 text-xs ${tab === item.key ? "bg-gold text-ink" : "bg-stone-100"}`}>{data?.partial ? "≥ " : ""}{items.filter(task => tabFor(task) === item.key).length}</span>
        </button>)}
      </div>
      {data?.partial && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Старые отчёты временно недоступны. Список неполный. <button onClick={resource.reload} className={`${control} underline`}>Обновить</button></div>}
      {tab === "clarify" && <p className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-600">В старых отчётах нет подтверждённого итогового результата. Уточните его по каждому заданию. Это не новые назначения ученику.</p>}
      <div className="space-y-3">
        {items.filter(item => tabFor(item) === tab).map(item => <HomeworkCard key={`${item.key}:${item.revision}`} item={item} studentId={crmStudentId} onSaved={async () => { setMessage("Решение сохранено. Оно доступно ученику; баллы не начислялись."); await resource.reload(); }} />)}
        {!items.some(item => tabFor(item) === tab) && <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600"><ClipboardList className="shrink-0" size={20} />{data?.partial ? "Полный список пока недоступен." : "В этом разделе заданий нет."}</div>}
      </div>
    </>}
  </div>;
}

function HomeworkCard({ item, studentId, onSaved }: { item: TeacherHomeworkItem; studentId: string; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState<LegacyDecision | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const pending = useRef<{ signature: string; requestKey: string } | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (!decision || !item.crmClassId || inFlight.current || stale) return;
    if (decision !== "accepted" && !comment.trim()) { setError("Напишите, что продолжить или почему задание неактуально."); return; }
    inFlight.current = true; setBusy(true); setError(null);
    const signature = JSON.stringify({ decision, comment: comment.trim(), expectedRevision: item.revision });
    if (pending.current?.signature !== signature) pending.current = { signature, requestKey: crypto.randomUUID() };
    try {
      await teacherHomeworkApi.resolve(studentId, item.crmClassId, { decision, comment: comment.trim(), expectedRevision: item.revision, requestKey: pending.current.requestKey });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить решение");
      if (reason instanceof ApiError && reason.status === 409) setStale(true);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="group rounded-xl border border-stone-200 bg-white" data-testid="teacher-homework-card">
    <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0"><h2 className="break-words text-base font-bold text-ink">{item.title}</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">{taskDate(item.assignedAt) ?? "Дата не указана"} · {item.model === "legacy" ? "Из отчёта по уроку" : "Задание по теме"}</p>
        <span className="mt-2 inline-block rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{labels[item.state] ?? "Статус уточняется"}</span>
      </div><ChevronDown size={18} className="shrink-0 text-stone-500 group-open:rotate-180" />
    </summary>
    <div className="grid gap-5 border-t border-stone-100 p-4 md:grid-cols-2 md:p-5">
      <div className="min-w-0"><h3 className="text-sm font-bold">Что было задано</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{item.instructions || "Описание не указано."}</p>
        {item.comment && <div className="mt-4 rounded-lg bg-stone-50 p-3"><p className="text-xs font-semibold text-stone-500">Последний комментарий</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.comment}</p></div>}
        {item.lessonHref && <Link href={item.lessonHref} className={`${control} mt-2 inline-flex items-center pl-0 text-amber-900`}>Исходный урок и материалы →</Link>}
        {item.history.length > 0 && <div className="mt-4 border-t border-stone-100 pt-4"><h3 className="text-sm font-bold">История решений</h3><ol className="mt-2 space-y-3">{[...item.history].reverse().map((event, index) => <li key={index} className="border-l-2 border-amber-200 pl-3 text-xs leading-5"><p className="font-semibold">{labels[event.decision]} · {event.actorName}</p><p className="text-stone-500">{taskDate(event.at, true)}</p>{event.comment && <p className="whitespace-pre-wrap break-words text-stone-700">{event.comment}</p>}</li>)}</ol></div>}
      </div>
      {item.model === "legacy" ? item.canResolve ? <form onSubmit={event => { event.preventDefault(); void save(); }} className="min-w-0 rounded-lg border border-amber-100 bg-amber-50/40 p-4">
        <fieldset disabled={busy || stale}><legend className="mb-3 text-sm font-bold">Решение преподавателя</legend>
          <div className="space-y-2">{decisions.map(option => <label key={option.key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${decision === option.key ? "border-gold bg-amber-50" : "border-stone-200 bg-white"}`}>
            <input type="radio" name={`decision-${item.key}`} value={option.key} checked={decision === option.key} onChange={() => setDecision(option.key)} className="accent-amber-700" />{option.label}
          </label>)}</div>
          <label className="mt-4 block text-xs font-semibold" htmlFor={`comment-${item.key}`}>Комментарий {decision && decision !== "accepted" ? "· обязателен" : "· необязательно"}</label>
          <textarea id={`comment-${item.key}`} value={comment} onChange={event => setComment(event.target.value)} maxLength={5000} rows={3} className="mt-2 w-full resize-y rounded-lg border border-stone-200 bg-white p-3 text-sm focus-visible:outline-amber-700" />
        </fieldset>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {stale && <Link href={`/admin/my-students/student/${encodeURIComponent(studentId)}/tasks`} onClick={() => window.location.reload()} className={`${control} mt-2 inline-flex underline`}>Обновить список</Link>}
        <button type="submit" disabled={busy || stale || !decision} className={`${control} mt-3 w-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-40`}>{busy ? "Сохраняем…" : "Сохранить решение"}</button>
        <p className="mt-3 text-xs leading-5 text-stone-500">Только результат старого задания. Баллы и прогресс тем повторно не начисляются.</p>
      </form> : <p className="rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">Задание другого преподавателя. Доступно для просмотра; изменить результат может ответственный преподаватель.</p>
        : <div className="rounded-lg bg-stone-50 p-4"><h3 className="text-sm font-bold">Ответ и проверка</h3><p className="mt-2 text-sm leading-6 text-stone-600">{item.reviewHref ? "Ответ, вложения и результат находятся в карточке проверки этого задания." : "Ответ пока не отправлен. Результат проверки на занятии оформляется в отчёте по уроку."}</p>
          {item.reviewHref && <Link href={item.reviewHref} className={`${control} mt-3 inline-flex items-center bg-ink text-white`}>Открыть проверку →</Link>}
        </div>}
    </div>
  </details>;
}
