/**
 * Stage 4: the pure part of the course-payment screens — money, school time, filters, the terms
 * of a course. No imports from the app, so the rules are covered by plain unit tests.
 */

export const SCHOOL_TIME_ZONE = "Asia/Aqtobe";
/** The school sits at UTC+5 all year (no summer time). */
const SCHOOL_UTC_OFFSET = "+05:00";

export type PaymentDisplayStatus = "pending" | "confirmed" | "rejected" | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentDisplayStatus, string> = {
  pending: "Ждёт проверки",
  confirmed: "Подтверждена",
  rejected: "Оплата не найдена",
  refunded: "Возвращена",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentDisplayStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  confirmed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  refunded: "bg-stone-100 text-stone-600",
};

export type AccessListStatus = "active" | "expired" | "revoked" | "scheduled";

export const ACCESS_STATUS_LABELS: Record<AccessListStatus, string> = {
  active: "Действует",
  expired: "Срок истёк",
  revoked: "Закрыт",
  scheduled: "Ещё не началось",
};

export const ACCESS_STATUS_STYLES: Record<AccessListStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-stone-100 text-stone-600",
  revoked: "bg-red-50 text-red-700",
  scheduled: "bg-amber-50 text-amber-800",
};

export function accessSourceLabel(source: "payment" | "admin_grant"): string {
  return source === "payment" ? "Оплата" : "Выдан вручную";
}

export function revokeReasonLabel(reason: "refund" | "admin" | null): string {
  if (reason === "refund") return "возврат оплаты";
  if (reason === "admin") return "закрыт администратором";
  return "";
}

/** 12000 -> «12 000 ₸» (a plain space, like the table and the messages). */
export function formatTenge(amount: number): string {
  return `${String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;
}

type DateInput = string | number | Date;

function schoolParts(value: DateInput) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute") };
}

/** «02.11.2026» in school time. */
export function formatSchoolDate(value: DateInput): string {
  const { year, month, day } = schoolParts(value);
  return `${day}.${month}.${year}`;
}

/** «02.11.2026, 15:30» in school time. */
export function formatSchoolDateTime(value: DateInput): string {
  const { hour, minute } = schoolParts(value);
  return `${formatSchoolDate(value)}, ${hour}:${minute}`;
}

/** The school day of a moment, as `YYYY-MM-DD`. */
export function schoolDay(value: DateInput = new Date()): string {
  const { year, month, day } = schoolParts(value);
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` plus calendar months; 31 Aug + 6 months is 28 Feb, not 3 March. */
export function addMonthsToDay(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const index = month - 1 + months;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(date, lastDay))}`;
}

/** An access given «до» a day lasts through that school day. */
export function schoolDayEndIso(day: string): string {
  return `${day}T23:59:00${SCHOOL_UTC_OFFSET}`;
}

export interface PaymentFilters {
  status?: PaymentDisplayStatus | "";
  courseId?: string;
  /** `YYYY-MM-DD`, the school day. */
  from?: string;
  to?: string;
  search?: string;
}

/** The query string of the list and of the table: only what is filled in. */
export function paymentFiltersQuery(filters: PaymentFilters, extra: Record<string, string | number> = {}): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.courseId) query.set("courseId", filters.courseId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const search = filters.search?.trim();
  if (search) query.set("search", search);
  for (const [key, value] of Object.entries(extra)) query.set(key, String(value));
  return query.toString();
}

/** The sum of the payments that stand: confirmed and not given back. */
export function sumStandingPayments(items: ReadonlyArray<{ displayStatus: PaymentDisplayStatus; amountKzt: number }>) {
  let count = 0;
  let amountKzt = 0;
  for (const item of items) {
    if (item.displayStatus !== "confirmed") continue;
    count += 1;
    amountKzt += item.amountKzt;
  }
  return { count, amountKzt };
}

export const MAX_COURSE_PRICE_KZT = 100_000_000;
export const MAX_FREE_LESSONS = 50;

/** «12 000», «12000» → 12000; empty → null (the course is free); anything else is refused. */
export function parseCoursePrice(input: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = input.replace(/[\s  ]/g, "");
  if (!text) return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Цена — целое число тенге, например 12000." };
  const value = Number(text);
  if (value < 1) return { ok: false, error: "Цена должна быть больше нуля. Чтобы сделать курс бесплатным, оставьте поле пустым." };
  if (value > MAX_COURSE_PRICE_KZT) return { ok: false, error: "Цена слишком большая." };
  return { ok: true, value };
}

export function parseFreeLessons(input: string): { ok: true; value: number } | { ok: false; error: string } {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: `Бесплатных уроков — целое число от 0 до ${MAX_FREE_LESSONS}.` };
  const value = Number(text);
  if (value > MAX_FREE_LESSONS) return { ok: false, error: `Бесплатных уроков не больше ${MAX_FREE_LESSONS}.` };
  return { ok: true, value };
}

/**
 * The lessons a stranger opens for free: the first `count` published lessons through all modules
 * in unlock order (the rule of the server). Used for the marks in the course tree.
 */
export function freeLessonIds(
  modules: ReadonlyArray<{ lessons: ReadonlyArray<{ id: string; isPublished: boolean }> }>,
  count: number,
): Set<string> {
  const ids: string[] = [];
  for (const module of modules) {
    for (const lesson of module.lessons) {
      if (lesson.isPublished) ids.push(lesson.id);
    }
  }
  return new Set(ids.slice(0, Math.max(0, count)));
}
