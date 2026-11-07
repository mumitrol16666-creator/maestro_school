import { formatSchoolDate, formatTenge } from "./course-payments-format";
import { pluralize } from "./plural";

/**
 * Stage 4: the pure part of what a student or a parent sees about paid courses — who is external,
 * the text of a course state, the lock of a lesson, the texts of the paywall. No imports from the
 * app, so the rules are covered by plain unit tests.
 */

/** Months of access one payment opens (decision 4.1). */
export const ACCESS_MONTHS = 6;
/** Points for a finished module and for a finished course (economy V2). */
export const MODULE_POINTS = 100;
export const COURSE_POINTS = 250;

/** Whom a text speaks to: a student («ты») or a parent («вы»). */
export type Voice = "ty" | "vy";

// ─── Audience ──────────────────────────────────────────────────────────────────

/** A student account without a link to the school. Old answers without `audience` mean the school. */
export function isExternalStudent(user: { role?: string | null; audience?: string | null } | null | undefined): boolean {
  return Boolean(user) && user!.role === "student" && user!.audience === "external";
}

/** A child of the family page without a card in the school: only the online courses are shown for them. */
export function isExternalChild(child: { audience?: string | null } | null | undefined): boolean {
  return child?.audience === "external";
}

/** The one line the family page says instead of the school overview. */
export function externalChildLine(firstName: string): string {
  return `${firstName.trim()} занимается онлайн-курсами Maestro`;
}

/**
 * What an external student opens in the student app: courses, tests, the profile. Everything else
 * (schedule, sector, league, school homework, lesson results…) is the school's and leads back to
 * the courses.
 */
export const EXTERNAL_ALLOWED_PREFIXES = ["/courses", "/lessons", "/tests", "/settings"] as const;
export const EXTERNAL_HOME_PATH = "/courses";

export function externalMayOpen(pathname: string): boolean {
  return EXTERNAL_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// ─── Course state ──────────────────────────────────────────────────────────────

export type CourseAccessKind = "school" | "paid" | "granted" | "none";

export interface CourseAccessInfo {
  forSale: boolean;
  kind: CourseAccessKind;
  expiresAt: string | null;
  /** Every lesson is open: free course, held access, or a staff preview. */
  fullAccess?: boolean;
  preview?: boolean;
  pendingPaymentRequest: { id: string; createdAt: string } | null;
}

export interface CourseSaleView {
  priceKzt: number | null;
  includedInSchool: boolean;
  freeLessonsCount: number;
  access: CourseAccessInfo | null;
}

/** The sale fields of a course in the catalog. A server without paid courses sends none: the course is free. */
export interface CourseSaleFields {
  priceKzt?: number | null;
  includedInSchool?: boolean;
  freeLessonsCount?: number;
  access?: CourseAccessInfo | null;
}

export function saleViewOf(course: CourseSaleFields): CourseSaleView {
  return {
    priceKzt: course.priceKzt ?? null,
    includedInSchool: Boolean(course.includedInSchool),
    freeLessonsCount: course.freeLessonsCount ?? 0,
    access: course.access ?? null,
  };
}

/** «12 000 ₸ за 6 месяцев». */
export function priceLabel(priceKzt: number): string {
  return `${formatTenge(priceKzt)} за ${ACCESS_MONTHS} месяцев`;
}

export type CourseStateTone = "free" | "school" | "active" | "pending" | "price";

export interface CourseStateLine {
  tone: CourseStateTone;
  text: string;
}

/** A course is for sale only with a positive price; no price means free as a whole. */
export function isForSale(course: Pick<CourseSaleView, "priceKzt">): boolean {
  return typeof course.priceKzt === "number" && course.priceKzt > 0;
}

/**
 * The one line under a course card: what the person holds or what the course costs.
 * Order: free → in the school → held access → waiting for the check → the price.
 */
export function courseStateLine(course: CourseSaleView, voice: Voice = "ty"): CourseStateLine {
  const forSale = isForSale(course);
  if (!forSale) return { tone: "free", text: "Бесплатно" };
  const access = course.access;
  if (access?.kind === "school") {
    return { tone: "school", text: voice === "ty" ? "Входит в твоё обучение" : "Входит в обучение ребёнка" };
  }
  if ((access?.kind === "paid" || access?.kind === "granted") && access.expiresAt) {
    return { tone: "active", text: `Доступ до ${formatSchoolDate(access.expiresAt)}` };
  }
  if (access?.pendingPaymentRequest) return { tone: "pending", text: "Ждём подтверждения оплаты" };
  return { tone: "price", text: priceLabel(course.priceKzt as number) };
}

/** «Первые 2 урока бесплатно» for a paid course the person does not hold yet. */
export function freeLessonsNote(course: CourseSaleView): string | null {
  if (!isForSale(course)) return null;
  const kind = course.access?.kind ?? "none";
  if (kind !== "none" || course.access?.fullAccess || course.freeLessonsCount <= 0) return null;
  const count = course.freeLessonsCount;
  if (count === 1) return "Первый урок бесплатно";
  return `Первые ${count} ${pluralize(count, ["урок", "урока", "уроков"])} бесплатно`;
}

// ─── Lesson lock ───────────────────────────────────────────────────────────────

/**
 * Why a lesson of a course is closed. Two causes live side by side: the payment
 * (`lessons[].locked` of `GET /courses/:id`) and the order (progress status `locked`).
 * - `payment`: only the payment is in the way (the lessons before it are done, or the course is not
 *   started). The person can act on it: the lesson opens as the paywall.
 * - `order`: only the order. The lesson opens nothing; the way back is the course page.
 * - `order_payment`: both. The order is what blocks the person right now (the server checks it
 *   before the payment), so it is the main word; «платный» is a small mark that payment is also needed.
 */
export type LessonLock = "payment" | "order" | "order_payment" | "not_started" | null;

export function mergeLessonLock(input: {
  paymentLocked?: boolean | null;
  progressStatus: string;
  enrolled: boolean;
}): LessonLock {
  const orderLocked = input.enrolled && input.progressStatus === "locked";
  if (input.paymentLocked) return orderLocked ? "order_payment" : "payment";
  if (!input.enrolled) return "not_started";
  if (orderLocked) return "order";
  return null;
}

export function lessonLockLabel(lock: LessonLock): string | null {
  if (lock === "payment") return "после оплаты";
  if (lock === "order" || lock === "order_payment") return "откроется после предыдущего";
  if (lock === "not_started") return "после начала курса";
  return null;
}

/** The small mark next to the main word of a lesson closed by the order and the payment at once. */
export function lessonLockBadge(lock: LessonLock): string | null {
  return lock === "order_payment" ? "платный" : null;
}

/** Where a closed lesson leads: only the payment alone opens the paywall; the order leads to the course. */
export function lessonLockHref(lock: LessonLock, ids: { courseId: string; lessonId: string }): string {
  if (lock === null || lock === "payment") return `/lessons/${ids.lessonId}`;
  return `/courses/${ids.courseId}`;
}

/**
 * A lesson of a paid course the person can open without holding the course: the first ones.
 * The server decides which lessons are closed; what is open in a paid course the person does not
 * hold is, by definition, one of the free ones.
 */
export function isFreeLesson(input: { paymentLocked?: boolean | null; course: CourseSaleView }): boolean {
  if (!isForSale(input.course)) return false;
  const access = input.course.access;
  if (!access || access.kind !== "none" || access.fullAccess || access.preview) return false;
  return !input.paymentLocked;
}

// ─── Rewards ───────────────────────────────────────────────────────────────────

/** The reward line of a course; only the new economy has one, the old Coins for a course are gone. */
export function courseRewardLine(rewardEconomyV2: boolean | null | undefined): string | null {
  return rewardEconomyV2 ? `+${MODULE_POINTS} баллов за модуль, +${COURSE_POINTS} за курс` : null;
}

// ─── Home screen ───────────────────────────────────────────────────────────────

export interface DashboardNextLesson {
  id: string;
  paymentRequired?: boolean;
  courseId?: string;
}

/** The hero of the home screen: a lesson that needs the payment leads to the course, not to the lesson. */
export function dashboardCourseAction(input: {
  nextLesson: DashboardNextLesson | null;
  currentCourseId: string;
}): { href: string; label: string } {
  const { nextLesson, currentCourseId } = input;
  if (nextLesson?.paymentRequired) {
    return { href: `/courses/${nextLesson.courseId ?? currentCourseId}`, label: "Оплатить курс" };
  }
  if (nextLesson) return { href: `/lessons/${nextLesson.id}`, label: "Открыть урок" };
  return { href: `/courses/${currentCourseId}`, label: "Открыть курс" };
}

// ─── Paywall ───────────────────────────────────────────────────────────────────

export type PaywallMode = "pay" | "pending" | "not_for_sale" | "school";

export interface PaywallView {
  canRequestPayment: boolean;
  blockedBy: "not_for_sale" | "school" | "pending" | null;
  lastRequest: {
    displayStatus: "pending" | "confirmed" | "rejected" | "refunded";
    rejectionReason: string | null;
    access: { expiresAt: string } | null;
  } | null;
}

export function paywallMode(view: Pick<PaywallView, "blockedBy">): PaywallMode {
  if (view.blockedBy === "not_for_sale") return "not_for_sale";
  if (view.blockedBy === "pending") return "pending";
  if (view.blockedBy === "school") return "school";
  return "pay";
}

/** An explanation above the form: why the person sees it again. */
export function paywallHistoryNote(
  view: Pick<PaywallView, "lastRequest">,
  voice: Voice,
  now: Date = new Date(),
): { tone: "rejected" | "info"; text: string } | null {
  const last = view.lastRequest;
  if (!last) return null;
  if (last.displayStatus === "rejected") {
    const reason = last.rejectionReason?.trim();
    return {
      tone: "rejected",
      text: reason ? `Оплата не найдена: ${reason}` : "Оплата не найдена.",
    };
  }
  if (last.displayStatus === "refunded") {
    return { tone: "info", text: "Прошлая оплата возвращена." };
  }
  if (last.displayStatus === "confirmed" && last.access && new Date(last.access.expiresAt).getTime() <= now.getTime()) {
    return {
      tone: "info",
      text: `Доступ закончился ${formatSchoolDate(last.access.expiresAt)}. ${voice === "ty" ? "Оплати" : "Оплатите"} курс снова, чтобы продолжить.`,
    };
  }
  return null;
}

export interface PaywallCopy {
  title: string;
  lead: (price: string) => string;
  includes: string[];
  kaspiButton: string;
  transferTitle: string;
  copyButton: string;
  copied: string;
  hintTitle: string;
  commentLabel: string;
  commentPlaceholder: string;
  paidButton: string;
  resendButton: string;
  sentTitle: string;
  sentText: string;
  pendingTitle: string;
  pendingText: string;
  notForSale: string;
  notConfigured: string;
}

export function paywallCopy(voice: Voice, childName?: string): PaywallCopy {
  const ty = voice === "ty";
  return {
    title: ty ? "Оплати курс, чтобы продолжить" : childName ? `Оплатите курс для ${childName}` : "Оплатите курс",
    lead: (price) => `Первые уроки бесплатные, дальше нужен доступ: ${price}.`,
    includes: [
      "Все уроки, видео и материалы курса",
      "Тесты после уроков и PDF к урокам",
      `Доступ на ${ACCESS_MONTHS} месяцев с дня подтверждения оплаты`,
    ],
    kaspiButton: "Оплатить через Kaspi Pay",
    transferTitle: "Перевод по номеру",
    copyButton: "Скопировать",
    copied: "Номер скопирован",
    hintTitle: "Как оплатить",
    commentLabel: "Комментарий (необязательно)",
    commentPlaceholder: ty ? "Например, с какого номера ты перевёл" : "Например, с какого номера вы перевели",
    paidButton: "Я оплатил",
    resendButton: "Отправить заявку снова",
    sentTitle: "Заявка отправлена",
    sentText: "Откроем доступ после проверки оплаты.",
    pendingTitle: "Ждём подтверждения оплаты",
    pendingText: "Заявка уже отправлена. Как только оплату проверят, доступ откроется.",
    notForSale: "Курс пока не продаётся",
    notConfigured: "Реквизиты для оплаты ещё не добавлены. Напишите в школу, мы подскажем, как оплатить.",
  };
}

/** The new price after a 409 COURSE_PRICE_CHANGED: `error.details.priceKzt`. */
export function priceFromChangedDetails(details: unknown): number | null {
  if (typeof details !== "object" || details === null) return null;
  const value = (details as { priceKzt?: unknown }).priceKzt;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function priceChangedText(priceKzt: number | null): string {
  return priceKzt ? `Цена изменилась: теперь ${formatTenge(priceKzt)}` : "Цена изменилась. Проверьте новую цену и нажмите ещё раз.";
}

// ─── The state of a request, for «Мои курсы» ──────────────────────────────────────

export type RequestDisplayStatus = "pending" | "confirmed" | "rejected" | "refunded";

export function requestStatusLabel(status: RequestDisplayStatus): string {
  if (status === "pending") return "Ждём подтверждения оплаты";
  if (status === "confirmed") return "Оплата подтверждена";
  if (status === "refunded") return "Оплата возвращена";
  return "Оплата не найдена. Можно отправить заявку снова";
}

/** The number a person pastes into the bank app: digits, with a leading «+» kept. */
export function phoneForCopy(phone: string): string {
  const text = phone.trim();
  const digits = text.replace(/\D/g, "");
  return text.startsWith("+") ? `+${digits}` : digits;
}

/** Only an https link is offered as «Оплатить через Kaspi Pay». */
export function safePaymentUrl(url: string | null | undefined): string | null {
  const text = url?.trim();
  return text && /^https:\/\/\S+$/i.test(text) ? text : null;
}

const TONE_ORDER: Record<CourseStateTone, number> = { pending: 0, active: 0, school: 0, price: 1, free: 2 };

/** The courses of a child: what is held or waited for first, then what can be bought, then the free ones. */
export function childCourseSort(
  a: CourseSaleView & { title: string },
  b: CourseSaleView & { title: string },
): number {
  const byState = TONE_ORDER[courseStateLine(a).tone] - TONE_ORDER[courseStateLine(b).tone];
  return byState || a.title.localeCompare(b.title, "ru");
}
