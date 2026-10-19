"use client";

import {
  AlertTriangle,
  ArrowRight,
  Cake,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Lightbulb,
  MessageSquare,
  MonitorPlay,
  RefreshCw,
  Users,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiRequest } from "@/lib/api-client";
import type { TeacherToday as TeacherTodayData, TeacherTodayLesson } from "@/types/teacher-today";

/**
 * The teacher's working day (plan 1.4): what needs attention first, today's
 * lessons with homework to check, reports still owed, student proposals,
 * messages and birthdays. Every row links to the screen where the work is done.
 */

const toneClass: Record<"danger" | "warning" | "info", string> = {
  danger: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

const phaseView: Record<TeacherTodayLesson["phase"], { label: string; className: string }> = {
  upcoming: { label: "Скоро", className: "bg-stone-100 text-stone-700" },
  now: { label: "Идёт", className: "bg-emerald-100 text-emerald-900" },
  ended: { label: "Закончился", className: "bg-stone-100 text-stone-500" },
};

const proposalKind: Record<string, string> = { topic: "Тема", song: "Песня", goal: "Цель" };

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function waited(hours: number) {
  if (hours < 1) return "только что";
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "день", "дня", "дней")} назад`;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" })
    .format(new Date(`${date}T12:00:00+05:00`));
}

function todayTitle(date: string) {
  const label = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" })
    .format(new Date(`${date}T12:00:00+05:00`));
  return label.charAt(0).toLocaleUpperCase("ru-RU") + label.slice(1);
}

function Section({ id, icon: Icon, title, count, children, action }: {
  id: string;
  icon: typeof CalendarDays;
  title: string;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-[24px] border border-stone-200 bg-white p-4 shadow-soft sm:p-5" data-testid={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-black text-ink">
          <Icon size={17} className="text-gold-ink" /> {title}
          {count ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{count}</span> : null}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function LessonRow({ lesson }: { lesson: TeacherTodayLesson }) {
  const phase = phaseView[lesson.phase];
  const who = lesson.kind === "group"
    ? lesson.groupName ?? "Группа"
    : lesson.kind === "trial" ? "Пробный урок" : lesson.studentName ?? "Индивидуальный урок";
  return (
    <li>
      <Link
        href={`/admin/offline-lessons/${encodeURIComponent(lesson.crmClassId)}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-stone-50"
      >
        <div className="w-14 shrink-0 text-center">
          <p className="text-base font-black text-ink">{lesson.startTime}</p>
          <p className="text-[11px] text-stone-400">{lesson.endTime}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{lesson.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
            <span className="inline-flex items-center gap-1">
              {lesson.kind === "group" ? <Users size={12} /> : <UserRound size={12} />} {who}
              {lesson.kind === "group" && lesson.studentsCount ? ` · ${lesson.studentsCount}` : ""}
            </span>
            {lesson.deliveryFormat === "online"
              ? <span className="inline-flex items-center gap-1 text-sky-800"><MonitorPlay size={12} /> онлайн</span>
              : lesson.roomName ? <span>{lesson.roomName}</span> : null}
          </p>
          {lesson.substitution || lesson.homeworkToCheck || (lesson.reportOpen && lesson.phase === "ended") ? (
            <p className="mt-1 flex flex-wrap gap-1.5">
              {lesson.substitution ? (
                <span data-testid="today-substitution" className="rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">Замена</span>
              ) : null}
              {lesson.homeworkToCheck ? (
                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                  ДЗ проверить: {lesson.homeworkToCheck}
                </span>
              ) : null}
              {lesson.reportOpen && lesson.phase === "ended" ? (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">Отчёт не отправлен</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${phase.className}`}>{phase.label}</span>
        <ArrowRight size={16} className="shrink-0 text-stone-400" />
      </Link>
    </li>
  );
}

export function TeacherToday() {
  const resource = useApiResource(() => apiRequest<TeacherTodayData>("/teachers/me/today"), []);
  const data = resource.data;

  if (resource.loading && !data) return <LoadingState label="Собираем ваш день" />;
  if (resource.error || !data) return <ErrorState message={resource.error ?? "Не удалось загрузить день"} retry={resource.reload} />;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5" data-testid="teacher-today">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-stone-600">{todayTitle(data.date)}</p>
        <button
          type="button"
          onClick={() => void resource.reload()}
          disabled={resource.loading}
          aria-label="Обновить день"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={resource.loading ? "animate-spin" : ""} /> Обновить
        </button>
      </div>

      {!data.crm.agendaAvailable || data.crm.agendaFromCache || !data.crm.rosterAvailable ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {data.crm.agendaAvailable
            ? "Расписание сейчас не отвечает: показаны последние сохранённые данные."
            : "Расписание сейчас не отвечает: уроки появятся, когда связь восстановится."}
        </p>
      ) : null}

      {data.attention.length ? (
        <section aria-label="Требует внимания" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="today-attention">
          {data.attention.map((item) => (
            <a
              key={item.kind}
              href={item.href}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition hover:brightness-95 ${toneClass[item.tone]}`}
            >
              <span className="inline-flex items-center gap-2">
                {item.tone === "danger" ? <AlertTriangle size={16} /> : null}
                {item.title}
              </span>
              <span className="text-lg font-black">{item.count}</span>
            </a>
          ))}
        </section>
      ) : (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          Всё закрыто: просроченных отчётов, предложений и непрочитанных сообщений нет.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-5">
          <Section
            id="today-lessons"
            icon={CalendarDays}
            title="Уроки сегодня"
            count={data.lessons.length}
            action={<Link href="/admin/offline-lessons" className="text-xs font-bold text-gold-ink hover:underline">Всё расписание</Link>}
          >
            {data.lessons.length ? (
              <ul className="-mx-2 divide-y divide-stone-100">
                {data.lessons.map((lesson) => <LessonRow key={lesson.crmClassId} lesson={lesson} />)}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">Сегодня уроков нет.</p>
            )}
          </Section>

          <Section id="today-reports" icon={ClipboardCheck} title="Отчёты к отправке" count={data.reports.length}>
            {data.reports.length ? (
              <ul className="-mx-2 divide-y divide-stone-100">
                {data.reports.map((report) => (
                  <li key={report.crmClassId}>
                    <Link
                      href={`/admin/offline-lessons/${encodeURIComponent(report.crmClassId)}`}
                      className="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-stone-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{report.title}{report.groupName ? ` · ${report.groupName}` : ""}</p>
                        <p className="text-xs text-stone-500">{dateLabel(report.date)}, {report.startTime} · закончился {waited(report.waitedHours)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${report.overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}`}>
                        {report.overdue ? "Просрочен" : "Заполнить"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">Все отчёты отправлены.</p>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-5">
          <Section id="today-proposals" icon={Lightbulb} title="Предложения учеников" count={data.proposals.total}>
            {data.proposals.items.length ? (
              <ul className="-mx-2 divide-y divide-stone-100">
                {data.proposals.items.map((proposal) => (
                  <li key={proposal.id}>
                    <Link
                      href={`/admin/my-students/student/${encodeURIComponent(proposal.crmStudentId)}`}
                      className="block rounded-2xl px-2 py-2.5 hover:bg-stone-50"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span className="font-bold text-ink">{proposal.studentName}</span>
                        <span>{proposalKind[proposal.kind] ?? "Тема"} · {proposal.direction}</span>
                        {proposal.stale ? <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700">ждёт больше 3 дней</span> : null}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-stone-800">{proposal.text}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">Новых предложений нет.</p>
            )}
            {data.proposals.total > data.proposals.items.length ? (
              <p className="mt-2 text-xs text-stone-500">И ещё {data.proposals.total - data.proposals.items.length} в карточках учеников.</p>
            ) : null}
          </Section>

          <Section id="today-messages" icon={MessageSquare} title="Сообщения">
            <Link href="/admin/messages" className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm font-bold text-ink hover:bg-stone-100">
              {data.messages.unread == null
                ? "Сообщения временно недоступны"
                : data.messages.unread
                  ? `Непрочитанных: ${data.messages.unread}`
                  : "Непрочитанных нет"}
              <ArrowRight size={16} className="text-stone-400" />
            </Link>
          </Section>

          {data.birthdays.length ? (
            <Section id="today-birthdays" icon={Cake} title="Дни рождения на неделе" count={data.birthdays.length}>
              <ul className="space-y-2">
                {data.birthdays.map((birthday) => (
                  <li key={birthday.crmStudentId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{birthday.name}{birthday.age ? `, ${birthday.age}` : ""}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${birthday.daysUntil === 0 ? "text-emerald-700" : "text-stone-500"}`}>
                      <Clock3 size={12} />
                      {birthday.daysUntil === 0 ? "сегодня" : birthday.daysUntil === 1 ? "завтра" : `через ${birthday.daysUntil} ${plural(birthday.daysUntil, "день", "дня", "дней")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
