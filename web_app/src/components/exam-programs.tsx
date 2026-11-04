"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Send, Trash2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";
import { sectorExamStatusLabel } from "@/lib/sector-exams-api";
import type { AdminSectorExamRow } from "@/types/sector-exam";

type Item = { title: string; criteria: string };
type Program = { id: string; directionId: string; sectorNumber: number; title: string; durationMinutes: number; revision: number; items: Item[]; direction: { title: string } };
type Session = { id: string; title: string; exams: Array<{ id: string; studentNameSnapshot: string | null; crmStudentId: string; status: string; scheduledAt: string | null }> };
const input = "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

export function ExamPrograms({ sectors, onChanged }: { sectors: AdminSectorExamRow[]; onChanged: () => void }) {
  const programs = useApiResource(() => apiRequest<Program[]>("/admin/exam-programs"), []);
  const sessions = useApiResource(() => apiRequest<Session[]>("/admin/exam-sessions"), []);
  const directions = useApiResource(() => apiRequest<Array<{ id: string; title: string }>>("/admin/exam-program-directions"), []);
  const [editing, setEditing] = useState<Program | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [directionId, setDirection] = useState("");
  const [sectorNumber, setNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(15);
  const [items, setItems] = useState<Item[]>([{ title: "", criteria: "" }]);
  const [selectedProgram, setProgram] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const program = programs.data?.find(row => row.id === selectedProgram);
  const ready = sectors.filter(row => row.progress.ready);
  const readinessGroups = useMemo(() => {
    const groups = new Map<string, { title: string; count: number }>();
    for (const row of sectors.filter(row => row.progress.ready && (!row.exam || row.exam.status === "completed" || row.exam.status === "cancelled"))) {
      const key = `${row.direction.id}:${row.curriculumNumber ?? row.sequence}`;
      const group = groups.get(key) ?? { title: `${row.direction.title} · сектор ${row.curriculumNumber ?? row.sequence}`, count: 0 };
      group.count++;
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [sectors]);
  const candidates = program ? ready.filter(row => row.direction.id === program.directionId && (row.curriculumNumber ?? row.sequence) === program.sectorNumber && (!row.exam || row.exam.status === "completed" || row.exam.status === "cancelled")) : [];
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError(null); setNote(null);
    try { await action(); } catch (reason) { setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить экзамен"); }
    finally { setBusy(null); }
  }
  function edit(row: Program | null) {
    setEditing(row); setDirection(row?.directionId ?? directions.data?.[0]?.id ?? "");
    setTitle(row?.title ?? ""); setNumber(row?.sectorNumber ?? 1); setDuration(row?.durationMinutes ?? 15);
    setItems(row?.items.map(item => ({ ...item })) ?? [{ title: "", criteria: "" }]); setShowEditor(true);
  }
  async function saveProgram() {
    await apiRequest(`/admin/exam-programs${editing ? `/${editing.id}` : ""}`, {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({ directionId, title, sectorNumber, durationMinutes: duration, items, ...(editing ? { expectedRevision: editing.revision } : {}) }),
    });
    await programs.reload(); setShowEditor(false); setNote("Программа экзамена сохранена.");
  }
  async function prepare() {
    if (!program || !selected.length) return;
    const key = requestKey ?? crypto.randomUUID(); setRequestKey(key);
    await apiRequest("/admin/exam-sessions", { method: "POST", body: JSON.stringify({ programId: program.id, programRevision: program.revision, title: sessionTitle.trim() || program.title, planIds: selected, requestKey: key }) });
    setRequestKey(null); setSelected([]); setSessionTitle(""); await sessions.reload(); onChanged();
    setNote("Экзамен подготовлен. Проверьте состав и отправьте на назначение в CRM.");
  }
  return <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-2xl">Программы и проведение экзаменов</h2>
      <button type="button" className={button} onClick={() => edit(null)}><Plus size={16} /> Новая программа</button>
    </div>
    <div className="flex flex-wrap gap-2">
      {readinessGroups.map(group => <p key={group.title} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{group.title} · готовы {group.count}</p>)}
      {!readinessGroups.length ? <p className="text-sm text-stone-500">Преподаватели пока не передали новых учеников на экзамен.</p> : null}
    </div>
    {programs.error || sessions.error || directions.error ? <p role="alert" className="text-sm text-red-700">{programs.error ?? sessions.error ?? directions.error}</p> : null}
    {showEditor ? <form onSubmit={event => { event.preventDefault(); void run("program", saveProgram); }} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-lg font-bold">{editing ? "Изменить программу" : "Новая программа экзамена"}</h3>
      <label className="grid gap-1 text-sm">Направление<select required value={directionId} onChange={event => setDirection(event.target.value)} className={input}>
        <option value="">Выберите направление</option>{directions.data?.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Номер сектора<input required type="number" min={1} max={100} value={sectorNumber} onChange={event => setNumber(Number(event.target.value))} className={input} /></label>
        <label className="grid gap-1 text-sm">Минут на ученика<input required type="number" min={5} max={240} value={duration} onChange={event => setDuration(Number(event.target.value))} className={input} /></label>
      </div>
      <label className="grid gap-1 text-sm">Название<input required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} className={input} /></label>
      {items.map((item, index) => <div key={index} className="grid gap-2 rounded-xl bg-white p-3">
        <label className="grid gap-1 text-sm">Задание {index + 1}<input required maxLength={255} value={item.title} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} className={input} /></label>
        <label className="grid gap-1 text-sm">Критерий выполнения<textarea maxLength={2000} value={item.criteria} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, criteria: event.target.value } : row))} className={input} /></label>
        <button type="button" disabled={items.length < 2} onClick={() => setItems(rows => rows.filter((_, i) => i !== index))} className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm text-red-700"><Trash2 size={16} /> Удалить задание</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={items.length >= 40} className={button} onClick={() => setItems(rows => [...rows, { title: "", criteria: "" }])}><Plus size={16} /> Добавить задание</button>
        <button type="submit" disabled={busy !== null} className={button}>{busy === "program" ? <LoaderCircle size={16} className="animate-spin" /> : null} Сохранить программу</button>
        <button type="button" onClick={() => setShowEditor(false)} className="min-h-11 px-3 text-sm">Закрыть</button>
      </div>
    </form> : null}
    <div className="grid gap-3 border-t border-stone-200 pt-4">
      <h3 className="text-lg font-bold">Создать экзамен и выбрать участников</h3>
      <label className="grid gap-1 text-sm">Программа<select value={selectedProgram} onChange={event => { setProgram(event.target.value); setSelected([]); setRequestKey(null); }} className={input}>
        <option value="">Выберите программу экзамена</option>{programs.data?.map(row => <option key={row.id} value={row.id}>{row.direction.title} · сектор {row.sectorNumber} · {row.title}</option>)}
      </select></label>
      {program ? <>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>{program.items.length} заданий · ориентир {program.durationMinutes} мин на ученика</span><button type="button" onClick={() => edit(program)} className="min-h-11 underline">Изменить программу</button></div>
        <ol className="list-inside list-decimal text-sm text-stone-600">{program.items.map((item, index) => <li key={index}>{item.title}{item.criteria ? ` — ${item.criteria}` : ""}</li>)}</ol>
        <label className="grid gap-1 text-sm">Название проведения<input value={sessionTitle} placeholder={program.title} maxLength={255} onChange={event => { setSessionTitle(event.target.value); setRequestKey(null); }} className={input} /></label>
        {candidates.map(row => <label key={row.planId} className="flex min-h-11 items-center gap-3 rounded-lg bg-stone-50 p-3 text-sm"><input type="checkbox" checked={selected.includes(row.planId)} onChange={event => { setRequestKey(null); setSelected(ids => event.target.checked ? [...ids, row.planId] : ids.filter(id => id !== row.planId)); }} />{row.studentName} · сектор {row.curriculumNumber ?? row.sequence} · {row.progress.percent}%</label>)}
        {!candidates.length ? <p className="text-sm text-stone-500">По этой программе нет готовых учеников без открытого экзамена.</p> : null}
        <button type="button" disabled={!selected.length || busy !== null} onClick={() => void run("session", prepare)} className={`${button} justify-self-start`}>{busy === "session" ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Подготовить экзамен · {selected.length} участников</button>
      </> : null}
    </div>
    {sessions.data?.length ? <div className="grid gap-3 border-t border-stone-200 pt-4"><h3 className="text-lg font-bold">Подготовленные экзамены</h3>{sessions.data.map(session => <div key={session.id} className="rounded-xl border border-stone-200 p-4">
      <p className="text-base font-bold">{session.title} · {session.exams.length} участников</p>
      <ul className="mt-2 grid gap-1 text-sm text-stone-600">{session.exams.map(exam => <li key={exam.id}>{exam.studentNameSnapshot ?? "Ученик без кабинета"} · {sectorExamStatusLabel[exam.status] ?? exam.status}</li>)}</ul>
      {session.exams.some(exam => exam.status === "draft") ? <button type="button" disabled={busy !== null} className={`${button} mt-3`} onClick={() => void run(session.id, async () => {
        await apiRequest(`/admin/exam-sessions/${session.id}/send`, { method: "POST", body: "{}" }); await sessions.reload(); onChanged(); setNote("Экзамен отправлен в CRM на назначение времени.");
      })}><Send size={16} /> Отправить на назначение в CRM</button> : null}
    </div>)}</div> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {note ? <p role="status" className="text-sm text-emerald-800">{note}</p> : null}
  </section>;
}
