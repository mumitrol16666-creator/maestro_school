"use client";

import {
  Activity,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { SectorProposalsPanel } from "@/components/sector-editor-parts";
import { SectorExamPanel } from "@/components/sector-exam-panel";
import { MaterialBadge, MaterialLibraryPicker } from "@/components/material-library-picker";
import { ShareCourseLesson } from "@/components/share-course-lesson";
import { BonusXpForm } from "@/components/league-bonus-form";
import type { MaterialLibraryItem } from "@/types/materials";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type {
  TeacherStudentWorkspace,
  WorkspaceHomeworkItem,
  WorkspaceTab,
} from "@/types/teacher-student-workspace";

const tabs: Array<{ key: WorkspaceTab; label: string; icon: typeof Target }> = [
  { key: "now", label: "Сейчас", icon: Target },
  { key: "activity", label: "Активность", icon: Activity },
  { key: "dynamics", label: "Динамика", icon: TrendingUp },
  { key: "tasks", label: "Задания", icon: ClipboardCheck },
  { key: "dialog", label: "Диалог", icon: MessageSquare },
];

const xpSourceLabels: Record<string, string> = {
  offline_lesson: "Уроки",
  online_lesson: "Онлайн-уроки",
  learning_homework: "ДЗ",
  course_homework: "Курсы",
  online_assignment: "Онлайн-задания",
  prepared_test: "Тесты",
  teacher_bonus: "Бонус учителя",
  monthly_plan: "Сектор",
};

const homeworkStateLabels: Record<string, string> = {
  assigned: "Проверить на уроке",
  waiting_review: "Проверить на уроке",
  revision: "На доработке",
  accepted: "Выполнено",
  accepted_with_comment: "Выполнено с замечанием",
  not_completed: "Не выполнено",
};

const attendanceLabels: Record<string, { label: string; className: string }> = {
  present: { label: "Был", className: "bg-emerald-50 text-emerald-800" },
  late: { label: "Опоздал", className: "bg-amber-50 text-amber-800" },
  excused_absence: { label: "Уваж.", className: "bg-stone-100 text-stone-600" },
  unexcused_absence: { label: "Пропуск", className: "bg-red-50 text-red-700" },
  emergency_freeze: { label: "Заморозка", className: "bg-stone-100 text-stone-600" },
  unmarked: { label: "Не отмечен", className: "bg-stone-100 text-stone-500" },
};

const control = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Aqtobe",
  }).format(date);
}

function relativeDays(value: string | null) {
  if (!value) return "не заходил";
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return formatDate(value);
}

export function StudentWorkspaceCard({
  crmStudentId,
  crmClassId,
  initialTab = "now",
  embedded = false,
  onTabChange,
}: {
  crmStudentId: string;
  crmClassId?: string | null;
  initialTab?: WorkspaceTab;
  embedded?: boolean;
  onTabChange?: (tab: WorkspaceTab) => void;
}) {
  const [tab, setTabState] = useState<WorkspaceTab>(initialTab);
  const resource = useApiResource(() => teacherStudentsApi.workspace(crmStudentId, crmClassId), [crmStudentId, crmClassId]);
  const data = resource.data;
  const limited = data?.access.kind === "lesson";
  const substitute = data?.access.kind === "substitute" ? data.access : null;

  function setTab(next: WorkspaceTab) {
    setTabState(next);
    onTabChange?.(next);
  }

  if (resource.loading && !data) return <LoadingState label="Открываем карточку ученика" />;
  if (resource.error || !data) return <ErrorState message={resource.error ?? "Не удалось открыть карточку ученика"} retry={resource.reload} />;

  const visibleTabs = limited ? tabs.filter((item) => item.key === "now") : tabs;

  return (
    <div className="min-w-0" data-testid="student-workspace-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-base font-black text-amber-900">
            {data.student.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || <UserRound size={20} />}
          </span>
          <div className="min-w-0">
            <h2 className={`font-display break-words leading-tight text-ink ${embedded ? "text-2xl" : "text-3xl"}`}>{data.student.name}</h2>
            <p className="mt-1 text-xs font-semibold text-stone-500">
              {[...data.student.directions, ...data.student.groups.map((group) => group.name)].join(" · ") || "Направление не указано"}
              {data.student.learningLevel ? ` · ${data.student.learningLevel}` : ""}
            </p>
            {!limited ? (
              <p className="mt-1 text-[11px] text-stone-400">
                {data.student.appActivity.linked
                  ? `В приложении: ${relativeDays(data.student.appActivity.lastActiveAt)}`
                  : "Приложение не подключено"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {embedded ? (
            <Link href={`/admin/my-students/student/${encodeURIComponent(crmStudentId)}`} target="_blank" className={`${control} border border-stone-200 bg-white text-stone-700`}>
              <ExternalLink size={14} /> Открыть карточку
            </Link>
          ) : null}
          {!limited ? (
            <Link href={`/admin/my-students/student/${encodeURIComponent(crmStudentId)}/plan`} className={`${control} border border-amber-200 bg-amber-50 text-amber-900`}>
              <Pencil size={14} /> Редактор сектора
            </Link>
          ) : null}
        </div>
      </header>

      {substitute ? (
        <p data-testid="workspace-substitute" className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs font-semibold leading-5 text-sky-900">
          <span className="mr-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">Замена</span>
          Вы ведёте урок{substitute.lessonDate ? ` ${formatLessonDay(substitute.lessonDate)}` : ""}
          {substitute.originalTeacherName ? ` вместо преподавателя ${substitute.originalTeacherName}` : " вместо постоянного преподавателя"}.
          {" "}Сектор, баллы, уровень, история и диалог открыты до утверждения урока, потом доступ и переписка закроются.
        </p>
      ) : null}

      {limited ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs font-semibold leading-5 text-amber-900">
          Вы заменяете преподавателя на этом уроке: видны только сектор и его темы. История, задания и диалог остаются у постоянного преподавателя.
        </p>
      ) : null}

      <nav aria-label="Разделы карточки ученика" className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          const badge = item.key === "tasks" ? data.homework.waitingCount : item.key === "now" ? data.proposals.length : 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(item.key)}
              className={`${control} shrink-0 ${active ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}
            >
              <Icon size={14} /> {item.label}
              {badge ? <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-gold text-ink" : "bg-amber-100 text-amber-900"}`}>{badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-5">
        {tab === "now" ? <NowTab data={data} crmStudentId={crmStudentId} crmClassId={crmClassId ?? null} onChanged={() => void resource.reload()} /> : null}
        {tab === "activity" ? <ActivityTab data={data} /> : null}
        {tab === "dynamics" ? <DynamicsTab data={data} /> : null}
        {tab === "tasks" ? <TasksTab data={data} crmStudentId={crmStudentId} /> : null}
        {tab === "dialog" ? <DialogTab data={data} /> : null}
      </div>
    </div>
  );
}

function formatLessonDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });
}

/* ─── Сейчас ─────────────────────────────────────────────────────────── */

function NowTab({
  data,
  crmStudentId,
  crmClassId,
  onChanged,
}: {
  data: TeacherStudentWorkspace;
  crmStudentId: string;
  crmClassId: string | null;
  onChanged: () => void;
}) {
  const limited = data.access.kind === "lesson";
  const waiting = data.homework.items.filter((item) => item.state === "waiting_review");
  const [proposalHint, setProposalHint] = useState<string | null>(null);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {!data.sectors.length ? (
        <EmptyState
          title="Сектор ещё не открыт"
          description="Откройте первый сектор в редакторе: темы, цель и тест, которые ученик увидит у себя."
          action={!limited ? <Link href={`/admin/my-students/student/${encodeURIComponent(crmStudentId)}/plan`} className={`${control} bg-ink text-white`}>Открыть сектор</Link> : undefined}
        />
      ) : data.sectors.map((sector) => (
        <SectorBlock key={sector.id} sector={sector} onChanged={onChanged} />
      ))}

      {!limited ? (
        <>
          <SectorExamPanel crmStudentId={crmStudentId} onChanged={onChanged} />
          {proposalHint ? <p className="rounded-xl bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-900">{proposalHint}</p> : null}
          <SectorProposalsPanel
            crmStudentId={crmStudentId}
            onAddTopic={(title) => setProposalHint(`Предложение принято. Добавьте тему «${title}» в редакторе сектора.`)}
          />

          <ShareCourseLesson crmStudentId={crmStudentId} appLinked={Boolean(data.student.appUserId)} />
          <div className="grid gap-4 lg:grid-cols-2">
            <HomeworkAssignForm sectors={data.sectors} crmClassId={crmClassId} available={data.homework.available} onDone={onChanged} />
            <BonusXpForm
              appUserId={data.student.appUserId}
              givenThisWeek={Boolean(data.weekXp?.bySource.some((row) => row.sourceType === "teacher_bonus"))}
            />
          </div>

          {waiting.length ? (
            <section className="rounded-2xl border border-sky-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-wider text-sky-900">Ждут проверки · {waiting.length}</p>
              <ul className="mt-3 divide-y divide-stone-100">
                {waiting.map((item) => <HomeworkRow key={item.recipientId} item={item} />)}
              </ul>
            </section>
          ) : null}

          <RecentLessons data={data} />
        </>
      ) : null}
    </div>
  );
}

function SectorBlock({ sector, onChanged }: { sector: StudentHomeMonthlyPlan; onChanged: () => void }) {
  return (
    <section className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5" data-testid="workspace-sector">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
            {sector.scope === "group" ? "Сектор группы" : "Сектор"} {sector.sequence ?? ""}{sector.direction?.title ? ` · ${sector.direction.title}` : ""}
          </p>
          <h3 className="font-display mt-1 break-words text-xl text-ink">{sector.goal || "Цель не задана"}</h3>
        </div>
        <div className="text-right">
          <strong className="text-2xl text-ink">{sector.progress.percent}%</strong>
          <p className="text-[11px] font-semibold text-stone-500">{sector.progress.completed} из {sector.progress.total} тем</p>
        </div>
      </div>
      <div className="mt-3"><ProgressBar value={sector.progress.percent} /></div>
      <ul className="mt-4 divide-y divide-amber-200/60 rounded-xl border border-amber-200/60 bg-white">
        {sector.items.filter((item) => !item.state || item.state === "active").map((item) => (
          <TopicRow key={item.id} item={item} editable={sector.scope === "student" || sector.scope === "group"} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function TopicRow({
  item,
  editable,
  onChanged,
}: {
  item: StudentHomeMonthlyPlan["items"][number];
  editable: boolean;
  onChanged: () => void;
}) {
  const percent = item.progressPercent ?? 0;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(percent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await teacherStudentsApi.updateLearningTopicProgress(item.id, {
        toPercent: next,
        expectedPercent: percent,
        sourceKey: `teacher-card:${item.id}:${crypto.randomUUID()}`,
        comment: "Отмечено в карточке ученика",
      });
      setOpen(false);
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить процент");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-3">
        {percent === 100 ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-stone-300" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
          {item.masteryCriteria ? <p className="truncate text-[11px] text-stone-500">{item.masteryCriteria}</p> : null}
        </div>
        <button
          type="button"
          disabled={!editable || percent === 100}
          onClick={() => setOpen((current) => !current)}
          className={`${control} min-h-8 border border-stone-200 bg-white px-2 text-stone-700`}
          aria-label={`Процент темы ${item.title}`}
        >
          {percent}%
        </button>
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-2">
          {[25, 50, 75, 90].map((step) => (
            <button key={step} type="button" disabled={busy} onClick={() => void save(step)} className={`${control} min-h-8 border border-stone-200 bg-white px-2`}>{step}%</button>
          ))}
          <input
            type="number"
            min={0}
            max={99}
            value={value}
            onChange={(event) => setValue(Math.max(0, Math.min(99, Number(event.target.value) || 0)))}
            className="h-8 w-16 rounded-lg border border-stone-200 bg-white px-2 text-xs"
            aria-label="Свой процент"
          />
          <button type="button" disabled={busy || value === percent} onClick={() => void save(value)} className={`${control} min-h-8 bg-ink px-3 text-white`}>
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : null} Сохранить
          </button>
          <span className="text-[10px] text-stone-500">100 % ставится в отчёте урока</span>
          {error ? <span className="text-[11px] font-semibold text-red-700">{error}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

function HomeworkAssignForm({
  sectors,
  crmClassId,
  available,
  onDone,
}: {
  sectors: StudentHomeMonthlyPlan[];
  crmClassId: string | null;
  available: boolean;
  onDone: () => void;
}) {
  const topics = sectors.flatMap((sector) => sector.items.filter((item) => (!item.state || item.state === "active") && item.progressPercent !== 100));
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [materials, setMaterials] = useState<MaterialLibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!available) return null;

  async function submit() {
    const chosen = topicId || topics[0]?.id;
    if (!chosen || instructions.trim().length < 3 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await learningHomeworkApi.createAssignment({
        topicId: chosen,
        instructions: instructions.trim(),
        dueAt: dueAt ? new Date(`${dueAt}T18:00:00+05:00`).toISOString() : null,
        sourceLessonId: crmClassId,
        idempotencyKey: crypto.randomUUID(),
        // Plan 1.12: materials picked from the school library; uploaded files stay same-site paths.
        materials: materials.map((item) => ({
          type: item.kind === "video" || item.kind === "audio" || item.kind === "link" ? item.kind : "file",
          url: item.url,
          title: item.title,
          ...(item.mimeType ? { mimeType: item.mimeType } : {}),
        })),
      });
      setInstructions("");
      setDueAt("");
      setMaterials([]);
      setMessage("Задание выдано, ученик получит уведомление");
      setOpen(false);
      onDone();
    } catch (reason) {
      setMessage(reason instanceof ApiError ? reason.message : "Не удалось выдать задание");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><BookOpenCheck size={14} /> Домашнее задание</p>
        <button type="button" onClick={() => setOpen((current) => !current)} disabled={!topics.length} className={`${control} min-h-8 border border-stone-200 px-2 text-stone-700`}>
          {open ? "Скрыть" : "Выдать ДЗ"}
        </button>
      </div>
      {!topics.length ? <p className="mt-2 text-xs text-stone-500">Нет открытых тем: добавьте тему в сектор, чтобы выдать задание.</p> : null}
      {message ? <p className="mt-2 text-xs font-semibold text-amber-900">{message}</p> : null}
      {open ? (
        <div className="mt-3 grid gap-2">
          <select value={topicId || topics[0]?.id || ""} onChange={(event) => setTopicId(event.target.value)} className="h-10 rounded-lg border border-stone-200 bg-white px-2 text-sm">
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="Что сделать к следующему уроку"
            className="w-full rounded-lg border border-stone-200 bg-white p-2 text-sm"
          />
          {materials.length < 5 ? (
            <MaterialLibraryPicker
              label="Материал к заданию"
              onPick={(item) => setMaterials((current) => current.some((row) => row.id === item.id) ? current : [...current, item])}
            />
          ) : null}
          {materials.length ? (
            <ul className="flex flex-wrap gap-1.5" data-testid="homework-picked-materials">
              {materials.map((item) => (
                <li key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                  <MaterialBadge badge={item.badge} />
                  <span className="min-w-0 truncate">{item.title}</span>
                  <button
                    type="button"
                    aria-label={`Убрать ${item.title}`}
                    className="grid h-6 w-6 place-items-center rounded-md hover:bg-amber-100"
                    onClick={() => setMaterials((current) => current.filter((row) => row.id !== item.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold text-stone-500">
              Срок
              <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="ml-2 h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs" />
            </label>
            <button type="button" disabled={busy || instructions.trim().length < 3} onClick={() => void submit()} className={`${control} ml-auto bg-ink text-white`}>
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Выдать
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RecentLessons({ data }: { data: TeacherStudentWorkspace }) {
  if (!data.recentLessons.available) {
    return <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500">История уроков временно недоступна: CRM не отвечает.</p>;
  }
  if (!data.recentLessons.items.length) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><CalendarCheck size={14} /> Последние уроки</p>
      <ul className="mt-3 divide-y divide-stone-100">
        {data.recentLessons.items.map((lesson) => (
          <li key={lesson.crmClassId} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-stone-500">{formatDate(lesson.date)}</span>
              <Link href={`/admin/offline-lessons/${encodeURIComponent(lesson.crmClassId)}`} className="truncate text-sm font-bold text-ink hover:text-amber-900">{lesson.title}</Link>
              {lesson.attended === false ? <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Не был</span> : null}
            </div>
            {lesson.lessonSummary ? <p className="mt-1 text-xs leading-5 text-stone-600">{lesson.lessonSummary}</p> : null}
            {lesson.homework ? <p className="mt-1 text-xs text-stone-500">ДЗ: {lesson.homework}</p> : null}
            {lesson.topicResults.length ? (
              <p className="mt-1 flex flex-wrap gap-1">
                {lesson.topicResults.map((result) => (
                  <span key={result.topicId} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${result.mastered ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                    {result.title}: {result.fromPercent}→{result.toPercent}%
                  </span>
                ))}
              </p>
            ) : null}
            {lesson.sectorClosed.length ? <p className="mt-1 text-[11px] font-bold text-emerald-800">Закрыт сектор{lesson.sectorClosed[0]?.sequence ? ` ${lesson.sectorClosed[0].sequence}` : ""} · +{lesson.sectorClosed[0]?.pointsAwarded} баллов</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── Активность ─────────────────────────────────────────────────────── */

function ActivityTab({ data }: { data: TeacherStudentWorkspace }) {
  const xp = data.weekXp;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><Sparkles size={14} /> XP этой недели</p>
        {xp ? (
          <>
            <p className="mt-2 text-3xl font-black text-ink">{xp.total} <span className="text-sm font-bold text-stone-500">XP</span></p>
            {xp.bySource.length ? (
              <p className="mt-1 flex flex-wrap gap-1.5">
                {xp.bySource.map((row) => <span key={row.sourceType} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">{xpSourceLabels[row.sourceType] ?? row.sourceType}: {row.amount}</span>)}
              </p>
            ) : <p className="mt-1 text-xs text-stone-500">На этой неделе XP ещё не было.</p>}
          </>
        ) : null}
        <p className="mt-3 text-[11px] text-stone-500">
          Последний вход: {relativeDays(data.student.appActivity.lastLoginAt)} · активность: {relativeDays(data.student.appActivity.lastActiveAt)}
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><ClipboardCheck size={14} /> Тесты</p>
        {!data.tests.length ? <p className="mt-2 text-xs text-stone-500">Тестов ещё не сдавал.</p> : (
          <ul className="mt-2 divide-y divide-stone-100">
            {data.tests.map((attempt) => (
              <li key={attempt.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-ink">{attempt.title}</span>
                <span className="shrink-0 text-xs text-stone-500">{formatDate(attempt.createdAt)}</span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-black ${attempt.passed ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{attempt.score}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><BookOpenCheck size={14} /> Уроки курсов</p>
        {!data.courses.length ? <p className="mt-2 text-xs text-stone-500">Курсы в приложении пока не проходил.</p> : (
          <ul className="mt-2 divide-y divide-stone-100">
            {data.courses.map((row) => (
              <li key={row.lessonId} className="py-2 text-sm">
                <p className="font-semibold text-ink">{row.lessonTitle}</p>
                <p className="text-[11px] text-stone-500">{row.courseTitle} · {row.moduleTitle} · {row.status === "completed" ? `пройден ${formatDate(row.completedAt)}` : row.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wider text-stone-600">ДЗ с версиями и решениями</p>
        {!data.homework.items.length ? <p className="mt-2 text-xs text-stone-500">Заданий в приложении пока нет.</p> : (
          <ul className="mt-2 divide-y divide-stone-100">
            {data.homework.items.slice(0, 8).map((item) => <HomeworkRow key={item.recipientId} item={item} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─── Динамика ───────────────────────────────────────────────────────── */

function DynamicsTab({ data }: { data: TeacherStudentWorkspace }) {
  const dynamics = data.dynamics;
  if (!dynamics) return <EmptyState title="Динамика недоступна" description="Для замены на уроке история ученика скрыта." />;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-end justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><CalendarCheck size={14} /> Посещаемость</p>
          <strong className="text-2xl text-ink">{dynamics.attendance.rate == null ? "—" : `${dynamics.attendance.rate}%`}</strong>
        </div>
        <p className="mt-2 flex flex-wrap gap-1">
          {dynamics.attendance.recent.map((item) => {
            const meta = attendanceLabels[item.attendanceStatus] ?? attendanceLabels.unmarked;
            return <span key={item.crmClassId} className={`rounded-md px-2 py-1 text-[10px] font-bold ${meta.className}`}>{formatDate(item.date)} · {meta.label}</span>;
          })}
          {!dynamics.attendance.recent.length ? <span className="text-xs text-stone-500">Уроков в истории пока нет.</span> : null}
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><ClipboardCheck size={14} /> Домашние задания за {dynamics.homework.windowDays} дней</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Принято", dynamics.homework.accepted, "text-emerald-800"],
            ["На доработку", dynamics.homework.revision, "text-red-700"],
            ["Ждут проверки", dynamics.homework.waiting, "text-sky-800"],
            ["В работе", dynamics.homework.assigned, "text-stone-700"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl bg-stone-50 px-3 py-2 text-center">
              <p className={`text-xl font-black ${tone}`}>{value}</p>
              <p className="text-[10px] font-bold text-stone-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><Target size={14} /> Секторы</p>
        {!dynamics.sectors.length ? <p className="mt-2 text-xs text-stone-500">Открытых секторов нет.</p> : (
          <ul className="mt-2 divide-y divide-stone-100">
            {dynamics.sectors.map((sector) => (
              <li key={sector.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold text-ink">{sector.scope === "group" ? "Сектор группы" : "Сектор"} {sector.sequence} · {sector.direction}</span>
                <span className="text-xs text-stone-500">{sector.completed}/{sector.total} тем · {sector.percent}%{sector.exam?.status === "completed" ? " · экзамен проведён" : sector.exam?.scheduledAt ? " · экзамен назначен" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─── Задания ────────────────────────────────────────────────────────── */

function HomeworkRow({ item }: { item: WorkspaceHomeworkItem }) {
  const tone = item.state === "waiting_review" ? "bg-sky-50 text-sky-900"
    : item.state === "revision" || item.state === "not_completed" ? "bg-red-50 text-red-700"
    : item.state.startsWith("accepted") ? "bg-emerald-50 text-emerald-800"
    : "bg-stone-100 text-stone-600";
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{item.topic.title}</p>
        <p className="text-[11px] text-stone-500">
          {formatDate(item.assignedAt)}{item.dueAt ? ` · до ${formatDate(item.dueAt)}` : ""} · цикл {item.currentCycle}
          {item.latestAttempt?.review ? ` · ${item.latestAttempt.review.decision === "revision" ? "возвращено" : "проверено"} ${formatDate(item.latestAttempt.review.reviewedAt)}` : ""}
        </p>
      </div>
      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${tone}`}>{homeworkStateLabels[item.state] ?? item.state}</span>
      {item.reviewHref ? (
        <Link href={item.reviewHref} className={`${control} min-h-8 border border-stone-200 bg-white px-2 text-stone-700`}>
          {item.state === "waiting_review" ? "Проверить" : "Открыть"}
        </Link>
      ) : null}
    </li>
  );
}

function TasksTab({ data, crmStudentId }: { data: TeacherStudentWorkspace; crmStudentId: string }) {
  const groups: Array<[string, WorkspaceHomeworkItem[]]> = [
    ["Ждут проверки", data.homework.items.filter((item) => item.state === "waiting_review")],
    ["В работе и на доработке", data.homework.items.filter((item) => item.state === "assigned" || item.state === "revision")],
    ["Принято", data.homework.items.filter((item) => item.state.startsWith("accepted"))],
  ];
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {groups.map(([title, items]) => (
        <section key={title} className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wider text-stone-600">{title} · {items.length}</p>
          {!items.length ? <p className="mt-2 text-xs text-stone-500">Пусто.</p> : (
            <ul className="mt-2 divide-y divide-stone-100">{items.map((item) => <HomeworkRow key={item.recipientId} item={item} />)}</ul>
          )}
        </section>
      ))}
      <Link href={`/admin/my-students/student/${encodeURIComponent(crmStudentId)}/tasks`} className={`${control} justify-self-start border border-stone-200 bg-white text-stone-700`}>
        Все задания, включая старые отчёты <ExternalLink size={14} />
      </Link>
    </div>
  );
}

/* ─── Диалог ─────────────────────────────────────────────────────────── */

function DialogTab({ data }: { data: TeacherStudentWorkspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"student" | "parent" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appUserId = data.student.appUserId;

  async function open(recipient: "student" | "parent") {
    if (!appUserId || busy) return;
    setBusy(recipient);
    setError(null);
    try {
      const result = await teacherStudentsApi.openDialog(appUserId, recipient);
      router.push(`/admin/messages?conversation=${encodeURIComponent(result.conversationId)}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось открыть диалог");
      setBusy(null);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><MessageSquare size={14} /> Написать</p>
        {!appUserId ? <p className="mt-2 text-xs text-stone-500">Ученик ещё не подключил приложение, сообщения дойдут после первого входа.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!appUserId || busy !== null} onClick={() => void open("student")} className={`${control} bg-ink text-white`}>
            {busy === "student" ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Ученику
          </button>
          <button type="button" disabled={!appUserId || busy !== null || !data.student.parents.length} onClick={() => void open("parent")} className={`${control} border border-stone-200 bg-white text-stone-700`}>
            {busy === "parent" ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Родителю
          </button>
        </div>
        {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wider text-stone-600">Семья</p>
        {!data.student.parents.length ? <p className="mt-2 text-xs text-stone-500">Родители в приложение не добавлены.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {data.student.parents.map((parent) => <li key={parent.id} className="font-semibold text-ink">{parent.name} <span className="text-xs font-normal text-stone-500">· {parent.relationship}</span></li>)}
          </ul>
        )}
        {data.student.phone ? <p className="mt-2 text-xs text-stone-500">Телефон ученика: {data.student.phone}</p> : null}
      </section>
      {data.proposals.length ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-sky-900">Ученик предложил</p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.proposals.map((proposal) => <li key={proposal.id} className="text-stone-800">{proposal.text}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-stone-500">Ответить можно во вкладке «Сейчас».</p>
        </section>
      ) : null}
    </div>
  );
}
