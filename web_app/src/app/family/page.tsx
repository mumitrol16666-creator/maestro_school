"use client";

import {
  AlertTriangle,
  Award,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  MapPin,
  MonitorPlay,
  Newspaper,
  Target,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { familyApi } from "@/lib/family-api";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { FamilyChild, FamilyMembership, FamilyNewsPost, FamilyResults, FamilySchoolSummary, FamilyVisit } from "@/types/family";
import { GroupSectorPassBadge, SectorExamSummary } from "@/components/sector-exam-summary";
import { sectorTitle } from "@/lib/sector-label";

const relationshipLabels: Record<string, string> = {
  mother: "Мама",
  father: "Папа",
  guardian: "Представитель",
  other: "Родитель",
};

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00`);
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(parseDate(value));
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

function signedMoney(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("ru-RU")} ₸`;
}

export default function FamilyPage() {
  const childrenResource = useApiResource(() => familyApi.children(), []);
  const newsResource = useApiResource(() => familyApi.news(5), []);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  useEffect(() => {
    if (!childrenResource.data?.length) return;
    const requestedChildId = new URLSearchParams(window.location.search).get("student");
    setSelectedChildId((current) => (
      current && childrenResource.data?.some((child) => child.id === current)
        ? current
        : requestedChildId && childrenResource.data?.some((child) => child.id === requestedChildId)
          ? requestedChildId
          : childrenResource.data![0].id
    ));
  }, [childrenResource.data]);

  if (childrenResource.loading) return <LoadingState label="Загружаем семейный кабинет" />;
  if (childrenResource.error) return <ErrorState message={childrenResource.error} retry={childrenResource.reload} />;
  if (!childrenResource.data?.length) {
    return <EmptyState title="Нет привязанных учеников" description="Администратор Maestro ещё не привязал ученика к этому профилю." />;
  }

  const selectedChild = childrenResource.data.find((child) => child.id === selectedChildId)
    ?? childrenResource.data[0];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-ink">Семейный кабинет</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-balance text-3xl sm:text-[2.5rem]">Главное об обучении</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              Расписание, оплата и прогресс ребёнка в одном месте.
            </p>
          </div>
          {childrenResource.data.length > 1 ? (
            <label className="w-full sm:w-auto sm:min-w-[260px]">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Ученик</span>
              <select value={selectedChild.id} onChange={(event) => setSelectedChildId(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold">
                {childrenResource.data.map((child) => <option key={child.id} value={child.id}>{child.fullName}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      <ChildOverview key={selectedChild.id} child={selectedChild} />
      <FamilyNews posts={newsResource.data ?? []} loading={newsResource.loading} error={newsResource.error} retry={newsResource.reload} />
    </div>
  );
}

/**
 * Plan 3.4: a notification opens the family page at what it is about. `notice` names the
 * section, `event` the lesson (its crmClassId) when there is one.
 */
const noticeSections: Record<string, { section: string; label: string }> = {
  report: { section: "visits", label: "Отчёт по уроку" },
  absence: { section: "visits", label: "Пропуск урока" },
  homework: { section: "visits", label: "Проверка домашнего задания" },
  balance: { section: "payment", label: "Оплата" },
  cancelled: { section: "schedule", label: "Отмена урока" },
  schedule: { section: "schedule", label: "Изменение расписания" },
  sector: { section: "sector", label: "Сектор и экзамен" },
};

function useNotice() {
  const [notice, setNotice] = useState<{ section: string; label: string; event: string | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = noticeSections[params.get("notice") ?? ""];
    if (target) setNotice({ ...target, event: params.get("event") });
  }, []);
  return notice;
}

function ChildOverview({ child }: { child: FamilyChild }) {
  const resource = useApiResource(() => familyApi.childOverview(child.id), [child.id]);
  const notice = useNotice();
  useEffect(() => {
    if (!notice || !resource.data) return;
    const target = (notice.event && document.getElementById(`visit-${notice.event}`))
      || document.getElementById(`family-${notice.section}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [notice, resource.data]);
  if (resource.loading) return <LoadingState label={`Загружаем данные: ${child.fullName}`} />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const { summary, visibility } = resource.data;
  const visibleModules = Object.values(visibility).filter(Boolean).length;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-charcoal px-5 py-7 text-white shadow-soft sm:px-8 sm:py-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 font-display text-xl text-gold-ink">
              {child.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={child.avatar} alt="" className="h-full w-full object-cover" />
              ) : child.firstName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-ink">{relationshipLabels[child.relationship] ?? "Ученик"}</p>
              <h2 className="font-display mt-1 break-words text-3xl sm:text-4xl">{child.fullName}</h2>
              <p className="mt-1 break-words text-sm text-white/50">{summary.profile.groups.map((group) => group.name).join(", ") || "Направление уточняется"}</p>
            </div>
          </div>
          {summary.financialBalance ? <Balance balance={summary.financialBalance} /> : null}
        </div>
      </section>

      {summary.crmUnavailable || summary.crmStale ? (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950" role="status" data-testid="family-crm-notice">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            {summary.crmUnavailable
              ? "Сейчас не удалось получить данные школы: оплата, расписание и посещения появятся позже. Сектор и результаты показаны."
              : `Данные школы показаны на ${summary.crmSnapshotAt ? new Date(summary.crmSnapshotAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "последнее обновление"}: связь со школой восстанавливается.`}
          </p>
        </section>
      ) : null}

      {notice ? (
        <p className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-stone-600" data-testid="family-notice">
          По уведомлению: {notice.label}
        </p>
      ) : null}

      {summary.financialBalance && (summary.financialBalance.membership || summary.financialBalance.otherMemberships.length) ? (
        <Payment balance={summary.financialBalance} highlighted={notice?.section === "payment"} />
      ) : null}

      {visibleModules === 0 ? (
        <section className="border-l-4 border-gold bg-paper px-5 py-5 text-sm leading-6 text-stone-600">
          Данные обучения скрыты по текущим настройкам семейного доступа. Изменить их может администратор по запросу ученика.
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {visibility.showSchedule ? <Schedule summary={summary} highlighted={notice?.section === "schedule"} /> : null}
        {visibility.showPlanProgress ? <div id="family-sector" className="scroll-mt-24"><MonthlyPlans studentId={child.id} /></div> : null}
      </div>

      {visibility.showSchedule && !summary.crmUnavailable ? (
        <Visits visits={summary.visits} highlightedClassId={notice?.section === "visits" ? notice.event : null} />
      ) : null}

      {visibility.showAchievements ? <Results results={summary.results} /> : null}
    </div>
  );
}

function Balance({ balance }: { balance: NonNullable<FamilySchoolSummary["financialBalance"]> }) {
  const debt = balance.signedAmountKzt < 0;
  return (
    <div className={`w-full border-l-2 px-5 py-2 sm:w-auto sm:min-w-[240px] ${debt ? "border-red-400" : "border-gold"}`}>
      <div className="flex items-center gap-2 text-white/50"><WalletCards size={16} /><span className="text-xs font-bold uppercase tracking-wider">Баланс</span></div>
      <p className={`font-display mt-2 text-3xl ${debt ? "text-red-200" : "text-white"}`}>{signedMoney(balance.signedAmountKzt)}</p>
      <p className="mt-1 text-xs text-white/45">{debt ? "задолженность" : balance.signedAmountKzt > 0 ? "внесено сверх оплаты" : "оплачено полностью"}</p>
    </div>
  );
}

function Schedule({ summary, highlighted }: { summary: FamilySchoolSummary; highlighted?: boolean }) {
  return (
    <section id="family-schedule" className={`scroll-mt-24 border-t-2 border-gold bg-paper p-5 shadow-soft sm:p-7 ${highlighted ? "ring-2 ring-gold" : ""}`}>
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Ближайшие занятия</p><h2 className="font-display mt-2 text-3xl">Расписание</h2></div>
        <CalendarDays className="text-gold-ink" />
      </div>
      {summary.upcomingLessons.length ? (
        <div className="mt-6 divide-y divide-stone-200">
          {summary.upcomingLessons.slice(0, 5).map((lesson, index) => (
            <div key={lesson.crmClassId} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[150px_1fr]">
              <div><p className="text-sm font-bold">{index === 0 ? "Ближайший урок" : formatDate(lesson.date)}</p><p className="mt-1 text-xs text-stone-500">{lesson.startTime}–{lesson.endTime}</p></div>
              <div><p className="font-display text-xl">{lesson.title}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">{lesson.teacherName ? <span className="inline-flex items-center gap-1"><UserRound size={13} />{lesson.teacherName}</span> : null}{lesson.deliveryFormat === "online" ? <span className="inline-flex items-center gap-1 font-bold text-sky-700"><MonitorPlay size={13} />Онлайн</span> : lesson.roomName ? <span className="inline-flex items-center gap-1"><MapPin size={13} />{lesson.roomName}</span> : null}<span className="inline-flex items-center gap-1"><Clock3 size={13} />{formatDate(lesson.date)}</span></div></div>
            </div>
          ))}
        </div>
      ) : <p className="mt-6 text-sm text-stone-500">Ближайшие занятия пока не назначены.</p>}
    </section>
  );
}

const planItemStatus = {
  planned: { label: "Запланировано", icon: Circle, className: "text-stone-500" },
  in_progress: { label: "В работе", icon: CircleDot, className: "text-amber-800" },
  completed: { label: "Выполнено", icon: CheckCircle2, className: "text-emerald-700" },
  moved: { label: "Заменена", icon: Circle, className: "text-stone-400" },
} as const;

function MonthlyPlans({ studentId }: { studentId: string }) {
  const resource = useApiResource(() => familyApi.childMonthlyPlans(studentId), [studentId]);
  const plans = resource.data?.plans ?? [];
  const aggregate = resource.data?.aggregateProgress;
  const title = plans.length === 1 ? sectorTitle(plans[0]!) : "Текущие сектора";

  return (
    <section className="border-t-2 border-stone-300 bg-paper p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Target className="text-gold-ink" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Учебный маршрут</p>
          <h2 className="font-display mt-2 text-3xl">{title}</h2>
        </div>
      </div>

      {resource.loading ? (
        <div className="mt-5"><LoadingState label="Загружаем сектор" /></div>
      ) : resource.error ? (
        <div className="mt-5"><ErrorState message={resource.error} retry={resource.reload} /></div>
      ) : !plans.length ? (
        <p className="mt-5 text-sm leading-6 text-stone-500">Преподаватель ещё не открыл сектор.</p>
      ) : (
        <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="text-sm font-bold text-stone-600">Закрыто тем: {aggregate?.completed ?? 0} из {aggregate?.total ?? 0}</p>
            <span className="font-display text-3xl text-gold-ink">{aggregate?.percent ?? 0}%</span>
          </div>
          <div className="mt-3"><ProgressBar value={aggregate?.percent ?? 0} /></div>
          <div className="mt-6 grid gap-5">
            {plans.map((plan) => <FamilyPlanDetails key={plan.id} plan={plan} />)}
          </div>
        </>
      )}
      {resource.data?.recentExams?.length ? (
        <div className="mt-6 grid gap-3" data-testid="family-recent-exams">
          {resource.data.recentExams.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">
                {sectorTitle(plan)} закрыт{plan.direction?.title ? ` · ${plan.direction.title}` : ""}
              </p>
              <h3 className="font-display mt-2 text-xl leading-tight">{plan.goal}</h3>
              <GroupSectorPassBadge pass={plan.memberPass} />
              <SectorExamSummary exam={plan.exam} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FamilyPlanDetails({ plan }: { plan: StudentHomeMonthlyPlan }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">
        {sectorTitle(plan)}
        {plan.direction?.title ? ` · ${plan.direction.title}` : ""}
      </p>
      <h3 className="font-display mt-2 text-2xl leading-tight">{plan.goal}</h3>
      <p className="mt-1 text-xs font-semibold text-stone-500">{plan.teacher.name || "Преподаватель Maestro"}</p>
      <div className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
        {plan.items.map((item) => {
          const status = planItemStatus[item.status] ?? planItemStatus.planned;
          const Icon = status.icon;
          const transferred = item.state === "transferred" || item.state === "replaced";
          return (
            <div key={item.id} className={`flex items-start gap-3 py-3 ${transferred ? "opacity-60" : ""}`}>
              <Icon size={17} className={`mt-0.5 shrink-0 ${status.className}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold leading-5">{item.title}</p>
                {!transferred && typeof item.progressPercent === "number" ? (
                  <div className="mt-2 flex items-center gap-2" data-testid="family-topic-progress">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${item.progressPercent === 100 ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.max(0, Math.min(100, item.progressPercent))}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[11px] font-black text-stone-700">{item.progressPercent}%</span>
                  </div>
                ) : null}
              </div>
              <span className={`max-w-[120px] shrink-0 text-right text-[11px] font-bold ${status.className}`}>
                {transferred ? "Заменена" : status.label}
              </span>
            </div>
          );
        })}
      </div>
      <GroupSectorPassBadge pass={plan.memberPass} />
      <SectorExamSummary exam={plan.exam} />
    </article>
  );
}

function lessonsLabel(count: number) {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "занятий";
  if (count % 10 === 1) return "занятие";
  if ([2, 3, 4].includes(count % 10)) return "занятия";
  return "занятий";
}

function MembershipRow({ membership }: { membership: FamilyMembership }) {
  return (
    <article className="grid min-w-0 gap-2 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center" data-testid="family-membership">
      <div className="min-w-0">
        <p className="break-words font-bold text-ink">{membership.title}</p>
        <p className="mt-1 break-words text-xs text-stone-500">
          {[membership.directionName, membership.groupName].filter(Boolean).join(" · ") || "Абонемент школы"}
          {membership.validUntil ? ` · до ${formatDate(membership.validUntil, true)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:justify-end">
        {membership.perLesson ? (
          <span className="font-semibold text-stone-600">Оплата за каждое занятие</span>
        ) : membership.classesRemaining !== null ? (
          <span className="font-bold text-ink">
            Осталось {membership.classesRemaining} {lessonsLabel(membership.classesRemaining)}
            {membership.totalClasses ? <span className="font-semibold text-stone-500"> из {membership.totalClasses}</span> : null}
          </span>
        ) : null}
        {membership.amountToPayKzt > 0 ? (
          <span className="font-bold text-red-700">К оплате {membership.amountToPayKzt.toLocaleString("ru-RU")} ₸</span>
        ) : membership.perLesson ? null : (
          <span className="font-semibold text-emerald-700">Оплачен</span>
        )}
      </div>
    </article>
  );
}

/** Plan 3.1: what the parent pays for and what is left — from CRM, without payment history. */
function Payment({ balance, highlighted }: { balance: NonNullable<FamilySchoolSummary["financialBalance"]>; highlighted?: boolean }) {
  const memberships = [balance.membership, ...balance.otherMemberships].filter((item): item is FamilyMembership => Boolean(item));
  // CRM's amount due is the unpaid part of memberships plus the lessons already held on credit.
  const forMemberships = memberships.reduce((sum, item) => sum + item.amountToPayKzt, 0);
  const forLessons = Math.max(0, balance.amountDueKzt - forMemberships);
  return (
    <section id="family-payment" className={`scroll-mt-24 border-t-2 border-gold bg-paper p-5 shadow-soft sm:p-7 ${highlighted ? "ring-2 ring-gold" : ""}`} data-testid="family-payment">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Абонемент</p><h2 className="font-display mt-2 text-3xl">Оплата</h2></div>
        <div className="text-right">
          <p className={`font-display text-3xl ${balance.amountDueKzt > 0 ? "text-red-700" : "text-emerald-700"}`}>
            {balance.amountDueKzt > 0 ? `${balance.amountDueKzt.toLocaleString("ru-RU")} ₸` : "Оплачено"}
          </p>
          <p className="text-xs text-stone-500">{balance.amountDueKzt > 0 ? "к оплате" : "долга нет"}</p>
          {forLessons > 0 ? (
            <p className="mt-1 text-xs font-semibold text-stone-600" data-testid="family-payment-lessons">
              из них за проведённые уроки: {forLessons.toLocaleString("ru-RU")} ₸
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {memberships.map((membership, index) => <MembershipRow key={membership.id ?? index} membership={membership} />)}
      </div>
      <p className="mt-3 text-xs text-stone-500">Оплатить и уточнить детали можно у администратора школы.</p>
    </section>
  );
}

const attendanceView: Record<FamilyVisit["attendance"], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  present: { label: "Был", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  late: { label: "Опоздал", className: "bg-amber-50 text-amber-900", icon: Clock3 },
  excused: { label: "Пропуск по причине", className: "bg-stone-100 text-stone-700", icon: Circle },
  absent: { label: "Пропуск", className: "bg-red-50 text-red-800", icon: XCircle },
  unmarked: { label: "Не отмечено", className: "bg-stone-100 text-stone-500", icon: Circle },
  pending: { label: "Ждёт подтверждения школой", className: "bg-stone-100 text-stone-600", icon: Clock3 },
};

/** Plan 3.2: the last lessons — came or not, and what the school confirmed was done. */
function Visits({ visits, highlightedClassId }: { visits: FamilyVisit[]; highlightedClassId?: string | null }) {
  return (
    <section id="family-visits" className="scroll-mt-24 border-t-2 border-stone-300 bg-paper p-5 shadow-soft sm:p-7" data-testid="family-visits">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Последние уроки</p><h2 className="font-display mt-2 text-3xl">Посещения</h2></div>
        <CalendarCheck className="text-gold-ink" />
      </div>
      {visits.length ? (
        <ul className="mt-5 divide-y divide-stone-200">
          {visits.map((visit, index) => {
            const view = attendanceView[visit.attendance];
            const Icon = view.icon;
            const highlighted = Boolean(highlightedClassId && visit.crmClassId === highlightedClassId);
            return (
              <li
                key={visit.crmClassId ?? index}
                id={visit.crmClassId ? `visit-${visit.crmClassId}` : undefined}
                className={`grid scroll-mt-24 gap-2 py-4 sm:grid-cols-[150px_1fr] ${highlighted ? "rounded-xl bg-amber-50 px-3 ring-2 ring-gold" : ""}`}
                data-testid="family-visit"
              >
                <div>
                  <p className="text-sm font-bold">{visit.date ? formatDate(visit.date) : "Дата уточняется"}</p>
                  <p className="mt-1 text-xs text-stone-500">{visit.startTime ?? ""}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${view.className}`}><Icon size={13} />{view.label}</span>
                    <span className="break-words text-sm font-semibold text-ink">{visit.title}</span>
                  </div>
                  {visit.topic ? <p className="mt-2 break-words text-sm text-stone-700"><span className="font-semibold">Тема:</span> {visit.topic}</p> : null}
                  {visit.summary ? <p className="mt-1 break-words text-sm text-stone-600">{visit.summary}</p> : null}
                  {!visit.confirmed ? (
                    <p className="mt-1 text-xs text-stone-500">Посещение и итог урока появятся после подтверждения школой.</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-5 text-sm text-stone-500">Прошедших уроков пока нет.</p>}
    </section>
  );
}

const sectorHow: Record<FamilyResults["sectors"][number]["how"], string> = {
  exam: "сдан на экзамене",
  teacher: "засчитан преподавателем",
  completed: "все темы освоены",
};

/** Plan 3.3: the month's results instead of weekly streak milestones. */
function Results({ results }: { results: FamilyResults | null }) {
  const empty = !results || (!results.topics.length && !results.sectors.length && !results.level);
  return (
    <section className="border-t border-stone-200 py-2" data-testid="family-results">
      <div className="flex items-center gap-3"><Award className="text-gold-ink" /><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">{results ? formatMonth(results.month) : "Этот месяц"}</p><h2 className="font-display mt-1 text-3xl">Результаты</h2></div></div>
      {empty ? <p className="mt-5 text-sm text-stone-500">Результаты месяца появятся, когда ребёнок освоит первую тему.</p> : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results!.level ? (
            <article className="border-l-2 border-gold bg-paper px-4 py-4" data-testid="family-result-level">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Уровень</p>
              <p className="font-display mt-1 text-2xl text-ink">{results!.level.title}</p>
              <p className="mt-1 text-xs text-stone-500">
                {results!.level.reachedThisMonth ? "Достигнут в этом месяце. " : ""}
                {results!.level.nextTitle ? `Пройдено ${results!.level.progressPercent}% пути до ${results!.level.nextTitle}` : "Высший уровень"}
              </p>
            </article>
          ) : null}
          {results!.sectors.map((sector) => (
            <article key={`${sector.scope}-${sector.planId}`} className="border-l-2 border-emerald-500 bg-paper px-4 py-4" data-testid="family-result-sector">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{formatDate(sector.at)}</p>
              <p className="mt-1 font-bold text-ink">{sectorTitle({ scope: sector.scope, sequence: sector.sequence })} · {sector.direction}</p>
              <p className="mt-1 text-xs text-stone-500">{sectorHow[sector.how]}{sector.certificate ? ` · сертификат ${sector.certificate}` : ""}</p>
            </article>
          ))}
          {results!.topics.length ? (
            <article className="border-l-2 border-gold bg-paper px-4 py-4 sm:col-span-2 lg:col-span-1" data-testid="family-result-topics">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Освоено тем: {results!.topics.length}</p>
              <ul className="mt-2 grid gap-1">
                {results!.topics.slice(0, 6).map((topic) => (
                  <li key={topic.id} className="break-words text-sm text-stone-700">· {topic.title}{topic.group ? " (группа)" : ""}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FamilyNews({ posts, loading, error, retry }: { posts: FamilyNewsPost[]; loading: boolean; error: string | null; retry: () => Promise<void> }) {
  return (
    <section className="border-t border-stone-200 pt-7">
      <div className="flex items-center gap-3"><Newspaper className="text-gold-ink" /><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Maestro</p><h2 className="font-display mt-1 text-3xl">Новости школы</h2></div></div>
      {loading ? <div className="mt-5"><LoadingState label="Загружаем новости" /></div> : error ? <div className="mt-5"><ErrorState message={error} retry={retry} /></div> : posts.length ? <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">{posts.map((post) => <article key={post.id} className="grid gap-2 py-5 sm:grid-cols-[150px_1fr]"><p className="text-xs font-semibold text-stone-400">{formatDate(post.publishedAt, true)}</p><div><h3 className="font-display text-2xl">{post.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">{post.excerpt}</p></div></article>)}</div> : <p className="mt-5 text-sm text-stone-500">Новых объявлений для родителей пока нет.</p>}
    </section>
  );
}
