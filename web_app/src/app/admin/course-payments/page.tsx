"use client";

import { Download, LoaderCircle, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { inputClass, PageControls, secondaryButton } from "@/components/admin-ui";
import { CoursePaymentCard, Money, type PaymentCardActions } from "@/components/course-payment-card";
import { CoursePaymentSettingsForm } from "@/components/course-payment-settings-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { PaymentActionDialog, type PaymentDialogRequest } from "@/components/payment-action-dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import {
  announceCoursePaymentsChanged,
  coursePaymentsApi,
  saveBlobAsFile,
  type AdminPaymentRequest,
} from "@/lib/course-payments-api";
import {
  PAYMENT_STATUS_LABELS,
  STANDING_PAYMENT_STATUSES,
  formatTenge,
  paymentFiltersQuery,
  schoolDay,
  sumStandingPayments,
  type PaymentDisplayStatus,
  type PaymentFilters,
} from "@/lib/course-payments-format";
import { formatCount } from "@/lib/plural";

type TabId = "queue" | "history" | "settings";

const PAGE_SIZE = 20;
const SUM_PAGE_SIZE = 100;
/** The sum for a period reads the pages of the list; this keeps one count from reading forever. */
const SUM_MAX_PAGES = 50;
const PAYMENTS_PERMISSION = "course_payments.manage";

const STATUS_OPTIONS: Array<{ value: PaymentDisplayStatus | ""; label: string }> = [
  { value: "", label: "Любой статус" },
  { value: "pending", label: PAYMENT_STATUS_LABELS.pending },
  { value: "confirmed", label: PAYMENT_STATUS_LABELS.confirmed },
  { value: "rejected", label: PAYMENT_STATUS_LABELS.rejected },
  { value: "refunded", label: PAYMENT_STATUS_LABELS.refunded },
  { value: "access_revoked", label: PAYMENT_STATUS_LABELS.access_revoked },
];

type Notice = { kind: "success" | "info" | "error"; text: string };

export default function CoursePaymentsPage() {
  return (
    <Suspense fallback={<LoadingState label="Открываем оплаты курсов" />}>
      <CoursePaymentsGate />
    </Suspense>
  );
}

function CoursePaymentsGate() {
  const { user, loading } = useAuth();
  if (loading || !user) return <LoadingState label="Открываем оплаты курсов" />;
  if (!user.permissions?.includes(PAYMENTS_PERMISSION)) {
    return (
      <EmptyState
        title="Раздел недоступен"
        description="Оплаты курсов проверяют администраторы с правом «Оплаты курсов». Попросите владельца школы выдать его вам."
      />
    );
  }
  return <CoursePaymentsWorkspace />;
}

function CoursePaymentsWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const requestParam = params.get("request");
  const [tab, setTab] = useState<TabId>("queue");
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<PaymentDialogRequest | null>(null);

  const [queuePage, setQueuePage] = useState(1);
  const [filters, setFilters] = useState<PaymentFilters>({ status: "", courseId: "", from: "", to: "", search: "" });
  const [searchInput, setSearchInput] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search === searchInput ? current : { ...current, search: searchInput }));
      setHistoryPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queue = useApiResource(
    () => coursePaymentsApi.list({ status: "pending" }, queuePage, PAGE_SIZE),
    [queuePage, version],
  );
  const history = useApiResource(
    () => coursePaymentsApi.list(filters, historyPage, PAGE_SIZE),
    [filters, historyPage, version],
  );
  const focused = useApiResource(
    async () => {
      if (!requestParam) return null;
      try {
        return await coursePaymentsApi.get(requestParam);
      } catch (reason) {
        if (reason instanceof ApiError && (reason.status === 404 || reason.status === 400)) return "missing" as const;
        throw reason;
      }
    },
    [requestParam, version],
  );
  // The payment right is enough: this list does not need the catalog right (a branch manager has none).
  const courses = useApiResource(() => coursePaymentsApi.courses(), []);

  const focusedRequest = focused.data && focused.data !== "missing" ? focused.data : null;
  const focusedId = focusedRequest?.id ?? null;
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusedId && focusRef.current) focusRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusedId]);

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
    announceCoursePaymentsChanged();
  }, []);

  /** Runs a decision. A 409 means someone decided first: say so calmly and read the list again. */
  const decide = useCallback(async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setDialog(null);
      setNotice({ kind: "success", text: success });
      refresh();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setDialog(null);
        setNotice({ kind: "info", text: `${reason.message} Список обновлён: проверьте, что с заявкой сейчас.` });
        refresh();
        return;
      }
      throw reason;
    }
  }, [refresh]);

  const actions: PaymentCardActions = useMemo(() => ({
    onConfirm: (item) => setDialog({
      title: "Подтвердить оплату?",
      description: `Открыть доступ к курсу «${item.course.title}» для ${item.student.name} на 6 месяцев?`,
      warning: item.repeatPurchase
        ? "У ученика уже есть доступ к этому курсу: старый срок не продлевается, откроется ещё один доступ."
        : undefined,
      confirmLabel: "Подтвердить и открыть",
      onConfirm: () => decide(
        () => coursePaymentsApi.confirm(item.id),
        `Доступ к курсу «${item.course.title}» открыт для ${item.student.name}.`,
      ),
    }),
    onReject: (item) => setDialog({
      title: "Оплата не найдена",
      description: `Заявка ${item.student.name} на ${formatTenge(item.amountKzt)} будет отклонена. Ученик увидит причину и сможет отправить заявку заново.`,
      confirmLabel: "Отклонить заявку",
      tone: "danger",
      field: {
        label: "Причина (её увидит ученик)",
        placeholder: "Например: перевод на эту сумму не пришёл",
        minLength: 3,
      },
      onConfirm: (note) => decide(
        () => coursePaymentsApi.reject(item.id, note),
        `Заявка ${item.student.name} отклонена, причина отправлена.`,
      ),
    }),
    onRefund: (item) => setDialog({
      title: "Вернуть оплату?",
      description: `Оплата ${formatTenge(item.amountKzt)} за курс «${item.course.title}» (${item.student.name}) будет отмечена как возвращённая. Деньги приложение не переводит: верните их вручную.`,
      warning: "Доступ к курсу закроется сразу. Баллы и пройденные уроки останутся.",
      confirmLabel: "Вернуть оплату",
      tone: "danger",
      field: {
        label: "Заметка (необязательно)",
        placeholder: "Например: вернули через Kaspi 03.11",
        minLength: 0,
      },
      onConfirm: (note) => decide(
        () => coursePaymentsApi.refund(item.id, note),
        `Оплата ${item.student.name} возвращена, доступ закрыт.`,
      ),
    }),
  }), [decide]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const course of courses.data ?? []) map.set(course.id, course.title);
    for (const item of [...(queue.data?.data ?? []), ...(history.data?.data ?? [])]) map.set(item.course.id, item.course.title);
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1], "ru"));
  }, [courses.data, queue.data, history.data]);

  async function downloadTable() {
    setExporting(true);
    setNotice(null);
    try {
      const file = await coursePaymentsApi.exportCsv(filters);
      saveBlobAsFile(file.blob, file.filename ?? `course-payments-${schoolDay()}.csv`);
      setNotice(file.truncated
        ? {
            kind: "info",
            text: "Таблица скачана, но в неё вошли не все оплаты: сервер отдаёт не больше 20 000 строк. Сузьте период или курс и скачайте остальное отдельно.",
          }
        : { kind: "success", text: "Таблица скачана. Она открывается в Excel." });
    } catch (reason) {
      setNotice({ kind: "error", text: reason instanceof Error ? reason.message : "Не удалось скачать таблицу" });
    } finally {
      setExporting(false);
    }
  }

  function changeFilter(patch: Partial<PaymentFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setHistoryPage(1);
  }

  function resetFilters() {
    setSearchInput("");
    setFilters({ status: "", courseId: "", from: "", to: "", search: "" });
    setHistoryPage(1);
  }

  const queueTotal = queue.data?.meta?.total ?? 0;
  const filtersActive = Boolean(filters.status || filters.courseId || filters.from || filters.to || filters.search);
  const queueItems = (queue.data?.data ?? []).filter((item) => item.id !== focusedId);
  const historyItems = (history.data?.data ?? []).filter((item) => item.id !== focusedId);

  const tabs: Array<{ id: TabId; label: string; badge?: number }> = [
    { id: "queue", label: "Ждут проверки", badge: queueTotal },
    { id: "history", label: "Все оплаты" },
    { id: "settings", label: "Реквизиты оплаты" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Курсы"
        title="Оплаты курсов"
        description="Ученик или родитель переводит деньги через Kaspi и нажимает «Я оплатил». Проверьте перевод и откройте доступ на 6 месяцев."
      />

      {notice ? (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          data-testid="payments-notice"
          className={`mb-5 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
            notice.kind === "success" ? "bg-emerald-50 text-emerald-800"
              : notice.kind === "info" ? "bg-amber-50 text-amber-900"
                : "bg-red-50 text-red-700"
          }`}
        >
          <span className="min-w-0 break-words">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Скрыть сообщение" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-black/5"><X size={16} /></button>
        </div>
      ) : null}

      {focused.data === "missing" ? (
        <p className="mb-5 rounded-xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700" data-testid="focused-missing">
          Заявка из ссылки не найдена. Возможно, она удалена или ссылка устарела.
          <button type="button" onClick={() => router.replace("/admin/course-payments")} className="ml-3 underline">Скрыть</button>
        </p>
      ) : null}
      {focusedRequest ? (
        <section ref={focusRef} className="mb-6 scroll-mt-24" aria-label="Заявка из уведомления" data-testid="focused-request">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-ink">Заявка из уведомления</p>
            <button type="button" onClick={() => router.replace("/admin/course-payments")} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-stone-500 hover:text-ink">
              <X size={15} />Скрыть
            </button>
          </div>
          <CoursePaymentCard item={focusedRequest} actions={actions} highlighted />
        </section>
      ) : null}

      <div role="tablist" aria-label="Разделы оплат курсов" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`payments-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`payments-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${
              tab === item.id ? "border-gold bg-ink text-white" : "border-stone-300 bg-paper text-stone-700 hover:border-gold"
            }`}
          >
            {item.label}
            {item.badge ? (
              <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold leading-none text-ink">{item.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <div role="tabpanel" id="payments-panel-queue" aria-labelledby="payments-tab-queue">
          {queue.loading && !queue.data ? <LoadingState label="Загружаем заявки" /> : queue.error && !queue.data ? <ErrorState message={queue.error} retry={queue.reload} /> : !queueItems.length && !queueTotal ? (
            <EmptyState title="Новых заявок нет" description="Когда ученик или родитель нажмёт «Я оплатил», заявка появится здесь. Самые старые сверху." />
          ) : (
            <>
              <p className="mb-3 text-sm text-stone-500">Самые старые заявки сверху. Ждут проверки: {queueTotal}.</p>
              <div className="space-y-4" data-testid="payment-queue">
                {queueItems.map((item) => <CoursePaymentCard key={item.id} item={item} actions={actions} />)}
              </div>
              {queue.data?.meta ? <PageControls page={queuePage} pages={queue.data.meta.pages} onChange={setQueuePage} /> : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div role="tabpanel" id="payments-panel-history" aria-labelledby="payments-tab-history">
          <section className="rounded-[22px] border border-stone-200 bg-paper p-4 shadow-soft sm:p-5" aria-label="Фильтры">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Статус
                <select data-testid="filter-status" value={filters.status ?? ""} onChange={(event) => changeFilter({ status: event.target.value as PaymentDisplayStatus | "" })} className={`${inputClass} mt-1.5 normal-case`}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Курс
                <select data-testid="filter-course" value={filters.courseId ?? ""} onChange={(event) => changeFilter({ courseId: event.target.value })} className={`${inputClass} mt-1.5 normal-case`}>
                  <option value="">Все курсы</option>
                  {courseOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">С даты
                <input type="date" value={filters.from ?? ""} max={filters.to || undefined} onChange={(event) => changeFilter({ from: event.target.value })} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">По дату
                <input type="date" value={filters.to ?? ""} min={filters.from || undefined} onChange={(event) => changeFilter({ to: event.target.value })} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 sm:col-span-2 lg:col-span-1">Поиск
                <span className="relative mt-1.5 block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input data-testid="filter-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Имя или телефон" className={`${inputClass} pl-9 normal-case`} />
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <PeriodSum filters={filters} version={version} />
              <div className="flex flex-col gap-2 sm:flex-row">
                {filtersActive ? <button type="button" onClick={resetFilters} className={secondaryButton}>Сбросить фильтры</button> : null}
                <button type="button" onClick={() => void downloadTable()} disabled={exporting} className={secondaryButton}>
                  {exporting ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
                  Скачать таблицу
                </button>
              </div>
            </div>
          </section>

          <div className="mt-5">
            {history.loading && !history.data ? <LoadingState label="Загружаем оплаты" /> : history.error && !history.data ? <ErrorState message={history.error} retry={history.reload} /> : !historyItems.length && !(history.data?.meta?.total) ? (
              <EmptyState title="Оплат не найдено" description={filtersActive ? "Измените или сбросьте фильтры." : "Заявки на оплату курсов появятся здесь."} />
            ) : (
              <>
                <p className="mb-3 text-sm text-stone-500">Найдено: {formatCount(history.data?.meta?.total ?? 0, ["заявка", "заявки", "заявок"])}. Новые сверху.</p>
                <div className="space-y-4" data-testid="payment-history">
                  {historyItems.map((item) => <CoursePaymentCard key={item.id} item={item} actions={actions} />)}
                </div>
                {history.data?.meta ? <PageControls page={historyPage} pages={history.data.meta.pages} onChange={setHistoryPage} /> : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div role="tabpanel" id="payments-panel-settings" aria-labelledby="payments-tab-settings">
          <CoursePaymentSettingsForm />
        </div>
      ) : null}

      <PaymentActionDialog request={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

/**
 * The money that stands for the chosen course, period and search: confirmed payments without
 * refunds. The server has no total, so the pages of the list are added up here.
 */
function PeriodSum({ filters, version }: { filters: PaymentFilters; version: number }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; count: number; amountKzt: number; partial: boolean }
    | { kind: "error" }
  >({ kind: "loading" });
  // Payments that stand: confirmed, and confirmed ones whose access was closed by hand (not refunded).
  const key = paymentFiltersQuery({ ...filters, status: "confirmed" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      let count = 0;
      let amountKzt = 0;
      let partial = false;
      for (const status of STANDING_PAYMENT_STATUSES) {
        const standing = { ...filters, status };
        let pages = 1;
        for (let page = 1; page <= pages; page += 1) {
          if (page > SUM_MAX_PAGES) {
            partial = true;
            break;
          }
          const result = await coursePaymentsApi.list(standing, page, SUM_PAGE_SIZE);
          if (cancelled) return;
          pages = result.meta?.pages ?? 1;
          const sum = sumStandingPayments(result.data);
          count += sum.count;
          amountKzt += sum.amountKzt;
        }
      }
      if (!cancelled) setState({ kind: "ready", count, amountKzt, partial });
    })().catch(() => {
      if (!cancelled) setState({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
    // `key` carries every filter that matters for the sum.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const period = filters.from || filters.to
    ? `за выбранный период`
    : "за всё время";
  return (
    <p className="text-sm text-stone-700" data-testid="period-sum" aria-live="polite">
      {state.kind === "loading" ? "Считаем сумму…" : state.kind === "error" ? "Не удалось посчитать сумму." : (
        <>
          Подтверждено {period}: <strong>{formatCount(state.count, ["оплата", "оплаты", "оплат"])}</strong> на <strong><Money value={state.amountKzt} /></strong>
          <span className="block text-xs text-stone-500">Возвращённые оплаты не считаются.{state.partial ? " Посчитаны первые 5 000 оплат." : ""}</span>
        </>
      )}
    </p>
  );
}
