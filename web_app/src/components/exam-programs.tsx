"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatExamDate, sectorExamStatusLabel } from "@/lib/sector-exams-api";
import type { AdminSectorExamRow } from "@/types/sector-exam";

type Item = { title: string; criteria: string };
type Program = { id: string; directionId: string; sectorNumber: number; title: string; durationMinutes: number; revision: number; items: Item[]; direction: { title: string } };
type Session = { id: string; title: string; programId: string; programRevision: number; programSnapshot: Omit<Program, "id" | "revision" | "direction">; exams: Array<{ id: string; planId: string; studentNameSnapshot: string | null; crmStudentId: string; status: string; scheduledAt: string | null; crmClassId?:string|null; plan?: { examReadyAt: string | null } }> };
type Options = { teachers: Array<{ id: string; name: string }>; rooms: Array<{ id: string; name: string }> };
const input = "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const outline = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-ink disabled:opacity-50";

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
  const [rosterSession, setRosterSession] = useState<Session | null>(null);
  const [search, setSearch] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!selectedProgram && programs.data?.length === 1) setProgram(programs.data[0].id); }, [programs.data, selectedProgram]);
  const program = rosterSession ? { ...rosterSession.programSnapshot, id: rosterSession.programId, revision: rosterSession.programRevision,
    direction: { title: directions.data?.find(d => d.id === rosterSession.programSnapshot.directionId)?.title ?? "" } } : programs.data?.find(row => row.id === selectedProgram);
  const readinessGroups = useMemo(() => {
    const groups = new Map<string, { title: string; count: number }>();
    for (const row of sectors.filter(row => row.progress.ready && (!row.exam || row.exam.status === "completed" || row.exam.status === "cancelled"))) {
      const key = `${row.direction.id}:${row.curriculumNumber ?? row.sequence}`;
      const group = groups.get(key) ?? { title: `${row.direction.title} · сектор ${row.curriculumNumber ?? row.sequence}`, count: 0 };
      group.count++; groups.set(key, group);
    }
    return [...groups.values()];
  }, [sectors]);
  const candidates = program ? sectors.filter(row => row.direction.id === program.directionId && (row.curriculumNumber ?? row.sequence) === program.sectorNumber
    && (!row.exam || row.exam.status === "completed" || row.exam.status === "cancelled" || rosterSession?.exams.some(exam => exam.id === row.exam?.id))) : [];
  const visible = candidates.filter(row => row.studentName.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")));
  const selectedReady = candidates.filter(row => selected.includes(row.planId) && row.progress.ready).length;
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
    const saved = await apiRequest<Program>(`/admin/exam-programs${editing ? `/${editing.id}` : ""}`, {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({ directionId, title, sectorNumber, durationMinutes: duration, items, ...(editing ? { expectedRevision: editing.revision } : {}) }),
    });
    await programs.reload(); setProgram(saved.id); setSelected([]); setRosterSession(null); setSearch("");
    setShowEditor(false); setNote(`Экзамен «${saved.title}» сохранён. Теперь выберите участников ниже.`);
  }
  async function prepare() {
    if (!program || !selected.length) return;
    if (rosterSession) {
      await apiRequest(`/admin/exam-sessions/${rosterSession.id}/participants`, { method: "PUT", body: JSON.stringify({ planIds: selected, expectedExamIds: rosterSession.exams.map(exam => exam.id) }) });
    } else {
      const key = requestKey ?? crypto.randomUUID(); setRequestKey(key);
      await apiRequest("/admin/exam-sessions", { method: "POST", body: JSON.stringify({ programId: program.id, programRevision: program.revision, title: sessionTitle.trim() || program.title, planIds: selected, requestKey: key }) });
    }
    const changed = Boolean(rosterSession);
    setRequestKey(null); setSelected([]); setSessionTitle(""); setRosterSession(null); await sessions.reload(); onChanged();
    setNote(changed ? "Состав экзамена сохранён." : "Экзамен с участниками сохранён. Нажмите «Назначить дату и преподавателя» в его карточке.");
  }
  return <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6" data-testid="exam-event-builder">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-display text-2xl">Экзамены: темы, ученики и дата</h2><p className="mt-1 text-sm text-stone-600">1. Подготовьте задания → 2. Выберите учеников → 3. Назначьте время → 4. Проведите экзамен и оформите результаты.</p></div>
      <button type="button" className={button} onClick={() => edit(null)}><Plus size={16} /> Новый экзамен</button>
    </div>
    <div className="flex flex-wrap gap-2">
      {readinessGroups.map(group => <p key={group.title} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{group.title} · готовы {group.count}</p>)}
      {!readinessGroups.length ? <p className="text-sm text-stone-600">Готовность учеников преподаватели отмечают в отчёте урока или в карточке ученика. Черновик экзамена можно собрать заранее.</p> : null}
    </div>
    {programs.error || sessions.error || directions.error ? <p role="alert" className="text-sm text-red-700">{programs.error ?? sessions.error ?? directions.error}</p> : null}
    {showEditor ? <form onSubmit={event => { event.preventDefault(); void run("program", saveProgram); }} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-lg font-bold">{editing ? "Изменить задания экзамена" : "Новый экзамен: название и задания"}</h3>
      <p className="text-sm text-stone-600">Здесь вы задаёте, что проверять на экзамене. Эти задания сохраняются отдельно от материалов сектора.</p>
      <label className="grid gap-1 text-sm">Направление<select required value={directionId} onChange={event => setDirection(event.target.value)} className={input}>
        <option value="">Выберите направление</option>{directions.data?.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
      </select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Номер сектора<input required type="number" min={1} max={100} value={sectorNumber} onChange={event => setNumber(Number(event.target.value))} className={input} /></label>
        <label className="grid gap-1 text-sm">Минут на ученика<input required type="number" min={5} max={240} value={duration} onChange={event => setDuration(Number(event.target.value))} className={input} /></label>
      </div>
      <label className="grid gap-1 text-sm">Название экзамена<input required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} className={input} /></label>
      {items.map((item, index) => <div key={index} className="grid gap-2 rounded-xl bg-white p-3">
        <label className="grid gap-1 text-sm">Задание {index + 1}<input required maxLength={255} value={item.title} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} className={input} /></label>
        <label className="grid gap-1 text-sm">Что считается выполнением<textarea maxLength={2000} value={item.criteria} onChange={event => setItems(rows => rows.map((row, i) => i === index ? { ...row, criteria: event.target.value } : row))} className={input} /></label>
        <button type="button" disabled={items.length < 2} onClick={() => setItems(rows => rows.filter((_, i) => i !== index))} className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm text-red-700"><Trash2 size={16} /> Удалить задание</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={items.length >= 40} className={outline} onClick={() => setItems(rows => [...rows, { title: "", criteria: "" }])}><Plus size={16} /> Добавить задание</button>
        <button type="submit" disabled={busy !== null} className={button}>{busy === "program" ? <LoaderCircle size={16} className="animate-spin" /> : null} Сохранить экзамен и выбрать учеников</button>
        <button type="button" onClick={() => setShowEditor(false)} className="min-h-11 px-3 text-sm">Закрыть</button>
      </div>
    </form> : null}
    <div id="exam-session-composer" className="grid gap-3 border-t border-stone-200 pt-4">
      <h3 className="text-lg font-bold">{rosterSession ? `Участники: ${rosterSession.title}` : "Выбрать участников экзамена"}</h3>
      {!rosterSession ? <label className="grid gap-1 text-sm">Экзамен<select value={selectedProgram} onChange={event => { setProgram(event.target.value); setSelected([]); setRequestKey(null); setSearch(""); }} className={input}>
        <option value="">Выберите экзамен</option>{programs.data?.map(row => <option key={row.id} value={row.id}>{row.title} · {row.direction.title} · сектор {row.sectorNumber}</option>)}
      </select></label> : null}
      {!program ? <p className="text-sm text-stone-600">Создайте экзамен или выберите сохранённый — появятся его задания и список учеников.</p> : <>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>{program.items.length} заданий · ориентир {program.durationMinutes} мин на ученика</span>{!rosterSession ? <button type="button" onClick={() => edit(program)} className="min-h-11 underline">Изменить задания</button> : <span className="text-stone-600">Задания зафиксированы при создании этого экзамена.</span>}</div>
        <ol className="list-inside list-decimal text-sm text-stone-700">{program.items.map((item, index) => <li key={index}>{item.title}{item.criteria ? ` — ${item.criteria}` : ""}</li>)}</ol>
        {!rosterSession ? <label className="grid gap-1 text-sm">Название проведения<input value={sessionTitle} placeholder={program.title} maxLength={255} onChange={event => { setSessionTitle(event.target.value); setRequestKey(null); }} className={input} /></label> : null}
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">Выбрано {selected.length} · готовность подтверждена у {selectedReady}</p><button type="button" className={outline} onClick={() => { setSelected(candidates.filter(row => row.progress.ready).slice(0, 20).map(row => row.planId)); setRequestKey(null); }}>Выбрать всех готовых</button></div>
        <p className="text-sm text-stone-600">Можно собрать 4–6 учеников в один экзамен. До назначения состав редактируется. Для назначения нужна отметка преподавателя о готовности каждого участника.</p>
        <label className="grid gap-1 text-sm">Найти ученика<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Имя или фамилия" className={input} /></label>
        <div className="grid max-h-96 gap-2 overflow-y-auto">{visible.map(row => <label key={row.planId} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <input type="checkbox" checked={selected.includes(row.planId)} disabled={!selected.includes(row.planId) && selected.length >= 20} onChange={event => { setRequestKey(null); setSelected(ids => event.target.checked ? [...ids, row.planId] : ids.filter(id => id !== row.planId)); }} />
          <span className="min-w-0 flex-1"><span className="block font-semibold">{row.studentName}</span><span className="text-xs text-stone-600">Сектор {row.curriculumNumber ?? row.sequence}</span></span>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${row.progress.ready ? "bg-emerald-100 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{row.exam?.status==="completed"&&row.exam.decision==="retake"?"Нужен повторный экзамен":row.progress.ready ? "Готов к экзамену" : "Готовность не отмечена"}</span>
        </label>)}</div>
        {!visible.length ? <p className="text-sm text-stone-600">{search ? "По этому имени ученики не найдены." : "Нет доступных учеников этого направления и сектора. Ученик с уже открытым экзаменом в другой состав не добавляется."}</p> : null}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!selected.length || busy !== null} onClick={() => void run("session", prepare)} className={button}>{busy === "session" ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} {rosterSession ? "Сохранить состав" : `Подготовить экзамен · ${selected.length} участников`}</button>
          {rosterSession ? <button type="button" className={outline} onClick={() => { setRosterSession(null); setSelected([]); }}>Отменить изменение</button> : null}</div>
      </>}
    </div>
    {sessions.data?.length ? <div className="grid gap-3 border-t border-stone-200 pt-4"><h3 className="text-lg font-bold">Экзамены с участниками</h3>{sessions.data.map(session => <SessionCard key={session.id} session={session} busy={busy} run={run} onChanged={() => { void sessions.reload(); onChanged(); }} onEdit={() => {
      setRosterSession(session); setSelected(session.exams.map(exam => exam.planId)); setSearch(""); setError(null); setNote(null);
      document.getElementById("exam-session-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }} />)}</div> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {note ? <p role="status" className="text-sm text-emerald-800">{note}</p> : null}
  </section>;
}

function SessionCard({ session, busy, run, onChanged, onEdit }: { session: Session; busy: string | null; run: (key: string, action: () => Promise<void>) => Promise<void>; onChanged: () => void; onEdit: () => void }) {
  const [booking, setBooking] = useState(false);
  const editable = session.exams.length > 0 && session.exams.every(exam => exam.status === "draft");
  const cancellable=session.exams.every(exam=>exam.status==="draft"&&!exam.crmClassId);
  const waiting = session.exams.some(exam => ["draft", "awaiting_schedule"].includes(exam.status));
  const ready = session.exams.filter(exam => Boolean(exam.plan?.examReadyAt)).length;
  const date = session.exams.find(exam => exam.scheduledAt)?.scheduledAt ?? null;
  return <div className="grid gap-3 rounded-xl border border-stone-200 p-4" data-testid="prepared-exam-session">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-base font-bold">{session.title} · {session.exams.length} участников</h4><p className="mt-1 text-sm text-stone-600">{date ? formatExamDate(date) : `Дата пока не назначена · готовы ${ready} из ${session.exams.length}`}</p></div><Link href={`/admin/exam-sessions/${session.id}`} className={outline}>Открыть экзамен и результаты</Link></div>
    <ul className="grid gap-1 text-sm text-stone-700">{session.exams.map(exam => <li key={exam.id}>{exam.studentNameSnapshot ?? "Ученик без кабинета"} · {sectorExamStatusLabel[exam.status] ?? exam.status}{exam.status === "draft" && !exam.plan?.examReadyAt ? " · нужна отметка готовности" : ""}</li>)}</ul>
    <div className="flex flex-wrap gap-2">{cancellable?<button type="button" className={outline} disabled={busy!==null} onClick={()=>void run(`cancel-${session.id}`,async()=>{await apiRequest(`/admin/exam-sessions/${session.id}/cancel`,{method:"POST",body:"{}"});onChanged();})}>Отменить черновик экзамена</button>:null}{editable ? <button type="button" className={outline} disabled={busy !== null} onClick={onEdit}>Изменить участников</button> : null}
      {waiting ? <button type="button" disabled={busy !== null} className={button} onClick={() => setBooking(value => !value)}><CalendarClock size={16} /> Назначить дату и преподавателя</button> : <span className="inline-flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 size={16} /> {session.exams.every(exam=>exam.status==="completed")?"Экзамен завершён":"Экзамен назначен"}</span>}</div>
    {booking ? <ScheduleForm session={session} busy={busy} run={run} onDone={() => { setBooking(false); onChanged(); }} /> : null}
  </div>;
}

function ScheduleForm({ session, busy, run, onDone }: { session: Session; busy: string | null; run: (key: string, action: () => Promise<void>) => Promise<void>; onDone: () => void }) {
  const options = useApiResource(() => apiRequest<Options>("/admin/exam-scheduling-options"), []);
  const [date, setDate] = useState(""); const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00"); const [teacherId, setTeacher] = useState(""); const [roomId, setRoom] = useState("");
  async function schedule() {
    await apiRequest(`/admin/exam-sessions/${session.id}/schedule`, { method: "POST", body: JSON.stringify({ date, startTime: start, endTime: end, teacherId, roomId }) });
    onDone();
  }
  return <form onSubmit={event => { event.preventDefault(); void run(`schedule-${session.id}`, schedule); }} className="grid gap-3 rounded-xl bg-sky-50 p-4" aria-label="Назначить экзамен">
    <p className="text-sm text-stone-700">Экзамен появится в расписании CRM, а ученики получат дату и ваши задания. Экзамен бесплатный, уроки из абонемента не списываются.</p>
    <label className="grid gap-1 text-sm">Дата экзамена<input required type="date" value={date} onChange={event => setDate(event.target.value)} className={input} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Начало<input required type="time" value={start} onChange={event => setStart(event.target.value)} className={input} /></label><label className="grid gap-1 text-sm">Окончание<input required type="time" value={end} onChange={event => setEnd(event.target.value)} className={input} /></label></div>
    <label className="grid gap-1 text-sm">Принимающий преподаватель<select required value={teacherId} onChange={event => setTeacher(event.target.value)} className={input}><option value="">Выберите преподавателя</option>{options.data?.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm">Кабинет<select required value={roomId} onChange={event => setRoom(event.target.value)} className={input}><option value="">Выберите кабинет</option>{options.data?.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    {options.error ? <p role="alert" className="text-sm text-red-700">{options.error}</p> : null}
    <button type="submit" className={`${button} justify-self-start`} disabled={busy !== null || options.loading || !options.data}>{busy === `schedule-${session.id}` ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />} Назначить экзамен</button>
  </form>;
}
