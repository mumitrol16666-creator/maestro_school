"use client";

import {
  Award,
  CalendarDays,
  Clock3,
  MapPin,
  MonitorPlay,
  Newspaper,
  Target,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { familyApi } from "@/lib/family-api";
import type { FamilyChild, FamilyNewsPost, FamilySchoolSummary } from "@/types/family";

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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Семейный кабинет</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">Главное об обучении</h1>
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

function ChildOverview({ child }: { child: FamilyChild }) {
  const resource = useApiResource(() => familyApi.childOverview(child.id), [child.id]);
  if (resource.loading) return <LoadingState label={`Загружаем данные: ${child.fullName}`} />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const { summary, visibility } = resource.data;
  const visibleModules = Object.values(visibility).filter(Boolean).length;
  return (
    <div className="space-y-6">
      <section className="bg-ink px-5 py-7 text-white shadow-soft sm:px-8 sm:py-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 font-display text-xl text-gold">
              {child.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={child.avatar} alt="" className="h-full w-full object-cover" />
              ) : child.firstName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{relationshipLabels[child.relationship] ?? "Ученик"}</p>
              <h2 className="font-display mt-1 break-words text-3xl sm:text-4xl">{child.fullName}</h2>
              <p className="mt-1 break-words text-sm text-white/50">{summary.profile.groups.map((group) => group.name).join(", ") || "Направление уточняется"}</p>
            </div>
          </div>
          {summary.financialBalance ? <Balance balance={summary.financialBalance} /> : null}
        </div>
      </section>

      {visibleModules === 0 ? (
        <section className="border-l-4 border-gold bg-paper px-5 py-5 text-sm leading-6 text-stone-600">
          Данные обучения скрыты по текущим настройкам семейного доступа. Изменить их может администратор по запросу ученика.
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {visibility.showSchedule ? <Schedule summary={summary} /> : null}
        {visibility.showPlanProgress ? <MonthlyPlan plan={summary.monthlyPlan} /> : null}
      </div>

      {visibility.showAchievements ? <Achievements achievements={summary.achievements} /> : null}
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

function Schedule({ summary }: { summary: FamilySchoolSummary }) {
  return (
    <section className="border-t-2 border-gold bg-paper p-5 shadow-soft sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Ближайшие занятия</p><h2 className="font-display mt-2 text-3xl">Расписание</h2></div>
        <CalendarDays className="text-gold" />
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

function MonthlyPlan({ plan }: { plan: FamilySchoolSummary["monthlyPlan"] }) {
  return (
    <section className="border-t-2 border-stone-300 bg-paper p-5 shadow-soft sm:p-7">
      <Target className="text-gold" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.17em] text-gold">{plan ? formatMonth(plan.month) : "Текущий месяц"}</p>
      <div className="mt-2 flex items-end justify-between gap-3"><h2 className="font-display text-3xl">Учебный план</h2><span className="font-display text-3xl text-gold">{plan?.progressPercent ?? 0}%</span></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gold" style={{ width: `${plan?.progressPercent ?? 0}%` }} /></div>
      {plan ? <><p className="mt-5 text-sm leading-6 text-stone-700">{plan.goal}</p><p className="mt-4 text-xs text-stone-500">Завершено тем: {plan.completedCount} из {plan.items.filter((item) => item.status !== "moved").length}</p></> : <p className="mt-5 text-sm leading-6 text-stone-500">План на текущий месяц ещё не добавлен.</p>}
    </section>
  );
}

function Achievements({ achievements }: { achievements: FamilySchoolSummary["achievements"] }) {
  return (
    <section className="border-t border-stone-200 py-2">
      <div className="flex items-center gap-3"><Award className="text-gold" /><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Результат</p><h2 className="font-display mt-1 text-3xl">Достижения</h2></div></div>
      {achievements.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{achievements.slice(0, 6).map((item) => <article key={item.code} className="border-l-2 border-gold bg-paper px-4 py-4"><p className="font-bold text-ink">{item.title}</p><p className="mt-2 text-xs leading-5 text-stone-500">{item.description || "Достижение получено"}</p></article>)}</div> : <p className="mt-5 text-sm text-stone-500">Первые достижения появятся по мере обучения.</p>}
    </section>
  );
}

function FamilyNews({ posts, loading, error, retry }: { posts: FamilyNewsPost[]; loading: boolean; error: string | null; retry: () => Promise<void> }) {
  return (
    <section className="border-t border-stone-200 pt-7">
      <div className="flex items-center gap-3"><Newspaper className="text-gold" /><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Maestro</p><h2 className="font-display mt-1 text-3xl">Новости школы</h2></div></div>
      {loading ? <div className="mt-5"><LoadingState label="Загружаем новости" /></div> : error ? <div className="mt-5"><ErrorState message={error} retry={retry} /></div> : posts.length ? <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">{posts.map((post) => <article key={post.id} className="grid gap-2 py-5 sm:grid-cols-[150px_1fr]"><p className="text-xs font-semibold text-stone-400">{formatDate(post.publishedAt, true)}</p><div><h3 className="font-display text-2xl">{post.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">{post.excerpt}</p></div></article>)}</div> : <p className="mt-5 text-sm text-stone-500">Новых объявлений для родителей пока нет.</p>}
    </section>
  );
}
