import { test } from "node:test";
import assert from "node:assert/strict";
import {
  childCourseSort,
  courseRewardLine,
  courseStateLine,
  dashboardCourseAction,
  externalMayOpen,
  freeLessonsNote,
  isExternalStudent,
  isFreeLesson,
  lessonLockLabel,
  mergeLessonLock,
  paywallHistoryNote,
  paywallMode,
  phoneForCopy,
  priceChangedText,
  priceFromChangedDetails,
  priceLabel,
  requestStatusLabel,
  safePaymentUrl,
  saleViewOf,
  type CourseSaleView,
} from "../../src/lib/course-access-format";

const none = { forSale: true, kind: "none" as const, expiresAt: null, pendingPaymentRequest: null };
const paidCourse = (access: Partial<NonNullable<CourseSaleView["access"]>> = {}): CourseSaleView => ({
  priceKzt: 12000,
  includedInSchool: false,
  freeLessonsCount: 2,
  access: { ...none, ...access },
});

test("only a student account marked external is external", () => {
  assert.equal(isExternalStudent({ role: "student", audience: "external" }), true);
  assert.equal(isExternalStudent({ role: "student", audience: "school" }), false);
  // An older answer without the field is the school: nothing is hidden by mistake.
  assert.equal(isExternalStudent({ role: "student" }), false);
  assert.equal(isExternalStudent({ role: "parent", audience: "external" }), false);
  assert.equal(isExternalStudent(null), false);
});

test("an external student opens courses, lessons, tests and the profile, and nothing of the school", () => {
  for (const path of ["/courses", "/courses/abc", "/lessons/abc", "/tests", "/tests/x", "/settings"]) {
    assert.equal(externalMayOpen(path), true, path);
  }
  for (const path of ["/dashboard", "/school-lessons", "/monthly-plan", "/league", "/tasks", "/tasks/school/1", "/progress", "/learning", "/online-lessons/5", "/shared-lessons", "/messages", "/board", "/rewards"]) {
    assert.equal(externalMayOpen(path), false, path);
  }
  // A path that only begins with the same letters is not the section.
  assert.equal(externalMayOpen("/coursesx"), false);
});

test("the price is written for six months", () => {
  assert.equal(priceLabel(12000), "12 000 ₸ за 6 месяцев");
});

test("a course without a price is free as a whole, whatever the access says", () => {
  const free: CourseSaleView = { priceKzt: null, includedInSchool: false, freeLessonsCount: 2, access: null };
  assert.deepEqual(courseStateLine(free), { tone: "free", text: "Бесплатно" });
  assert.deepEqual(courseStateLine({ ...free, priceKzt: 0 }), { tone: "free", text: "Бесплатно" });
  assert.equal(freeLessonsNote(free), null);
});

test("the state line: the price, waiting, the end of access, the school", () => {
  assert.deepEqual(courseStateLine(paidCourse()), { tone: "price", text: "12 000 ₸ за 6 месяцев" });
  assert.deepEqual(
    courseStateLine(paidCourse({ pendingPaymentRequest: { id: "r", createdAt: "2026-11-02T10:00:00Z" } })),
    { tone: "pending", text: "Ждём подтверждения оплаты" },
  );
  assert.deepEqual(
    courseStateLine(paidCourse({ kind: "paid", expiresAt: "2027-05-02T10:00:00.000Z" })),
    { tone: "active", text: "Доступ до 02.05.2027" },
  );
  assert.deepEqual(
    courseStateLine(paidCourse({ kind: "granted", expiresAt: "2027-05-02T10:00:00.000Z" })).tone,
    "active",
  );
  assert.deepEqual(courseStateLine(paidCourse({ kind: "school" })), { tone: "school", text: "Входит в твоё обучение" });
});

test("held access wins over a request that waits; the school wins over everything", () => {
  const state = courseStateLine(paidCourse({
    kind: "paid",
    expiresAt: "2027-05-02T10:00:00.000Z",
    pendingPaymentRequest: { id: "r", createdAt: "2026-11-02T10:00:00Z" },
  }));
  assert.equal(state.tone, "active");
});

test("a parent reads the same states in «вы»", () => {
  assert.equal(courseStateLine(paidCourse({ kind: "school" }), "vy").text, "Входит в обучение ребёнка");
});

test("the note about free lessons is for a course the person does not hold", () => {
  assert.equal(freeLessonsNote(paidCourse()), "Первые 2 урока бесплатно");
  assert.equal(freeLessonsNote({ ...paidCourse(), freeLessonsCount: 1 }), "Первый урок бесплатно");
  assert.equal(freeLessonsNote({ ...paidCourse(), freeLessonsCount: 5 }), "Первые 5 уроков бесплатно");
  assert.equal(freeLessonsNote({ ...paidCourse(), freeLessonsCount: 21 }), "Первые 21 урок бесплатно");
  assert.equal(freeLessonsNote({ ...paidCourse(), freeLessonsCount: 0 }), null);
  assert.equal(freeLessonsNote(paidCourse({ kind: "paid", expiresAt: "2027-05-02T10:00:00.000Z" })), null);
  assert.equal(freeLessonsNote(paidCourse({ fullAccess: true })), null);
});

test("two locks of a lesson merge into one: payment first, then the order", () => {
  assert.equal(mergeLessonLock({ paymentLocked: true, progressStatus: "locked", enrolled: true }), "payment");
  // Paid for the access, but the previous lesson is not done: the order.
  assert.equal(mergeLessonLock({ paymentLocked: false, progressStatus: "locked", enrolled: true }), "order");
  assert.equal(mergeLessonLock({ paymentLocked: false, progressStatus: "available", enrolled: true }), null);
  assert.equal(mergeLessonLock({ paymentLocked: undefined, progressStatus: "in_progress", enrolled: true }), null);
  assert.equal(mergeLessonLock({ paymentLocked: false, progressStatus: "completed", enrolled: true }), null);
  // A course not started has no progress at all: it is not «after the previous».
  assert.equal(mergeLessonLock({ paymentLocked: false, progressStatus: "locked", enrolled: false }), "not_started");
  assert.equal(mergeLessonLock({ paymentLocked: true, progressStatus: "locked", enrolled: false }), "payment");
});

test("the two locks are named differently", () => {
  assert.equal(lessonLockLabel("payment"), "после оплаты");
  assert.equal(lessonLockLabel("order"), "откроется после предыдущего");
  assert.equal(lessonLockLabel("not_started"), "после начала курса");
  assert.equal(lessonLockLabel(null), null);
});

test("a lesson is marked free only in a paid course the person does not hold", () => {
  assert.equal(isFreeLesson({ paymentLocked: false, course: paidCourse() }), true);
  assert.equal(isFreeLesson({ paymentLocked: true, course: paidCourse() }), false);
  assert.equal(isFreeLesson({ paymentLocked: false, course: paidCourse({ kind: "paid", expiresAt: "2027-05-02T10:00:00.000Z" }) }), false);
  assert.equal(isFreeLesson({ paymentLocked: false, course: paidCourse({ kind: "school" }) }), false);
  assert.equal(isFreeLesson({ paymentLocked: false, course: paidCourse({ preview: true }) }), false);
  assert.equal(isFreeLesson({ paymentLocked: false, course: { priceKzt: null, includedInSchool: false, freeLessonsCount: 2, access: null } }), false);
});

test("a catalog without sale fields means a free course", () => {
  assert.deepEqual(saleViewOf({}), { priceKzt: null, includedInSchool: false, freeLessonsCount: 0, access: null });
});

test("the reward line exists only in the new economy", () => {
  assert.equal(courseRewardLine(true), "+100 баллов за модуль, +250 за курс");
  assert.equal(courseRewardLine(false), null);
  assert.equal(courseRewardLine(undefined), null);
});

test("the home screen says «Оплатить курс» when the lesson needs the payment", () => {
  assert.deepEqual(
    dashboardCourseAction({ nextLesson: { id: "l1", paymentRequired: true, courseId: "c1" }, currentCourseId: "c0" }),
    { href: "/courses/c1", label: "Оплатить курс" },
  );
  assert.deepEqual(
    dashboardCourseAction({ nextLesson: { id: "l1", paymentRequired: true }, currentCourseId: "c0" }),
    { href: "/courses/c0", label: "Оплатить курс" },
  );
  assert.deepEqual(
    dashboardCourseAction({ nextLesson: { id: "l1" }, currentCourseId: "c0" }),
    { href: "/lessons/l1", label: "Открыть урок" },
  );
  assert.deepEqual(
    dashboardCourseAction({ nextLesson: null, currentCourseId: "c0" }),
    { href: "/courses/c0", label: "Открыть курс" },
  );
});

test("the paywall mode follows what blocks the request", () => {
  assert.equal(paywallMode({ blockedBy: null }), "pay");
  assert.equal(paywallMode({ blockedBy: "pending" }), "pending");
  assert.equal(paywallMode({ blockedBy: "not_for_sale" }), "not_for_sale");
  assert.equal(paywallMode({ blockedBy: "school" }), "school");
});

test("the note above the form says why the person is here again", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  assert.equal(paywallHistoryNote({ lastRequest: null }, "ty", now), null);
  assert.deepEqual(
    paywallHistoryNote({ lastRequest: { displayStatus: "rejected", rejectionReason: "Перевод не найден", access: null } }, "ty", now),
    { tone: "rejected", text: "Оплата не найдена: Перевод не найден" },
  );
  assert.equal(
    paywallHistoryNote({ lastRequest: { displayStatus: "rejected", rejectionReason: " ", access: null } }, "ty", now)?.text,
    "Оплата не найдена.",
  );
  assert.equal(
    paywallHistoryNote({ lastRequest: { displayStatus: "refunded", rejectionReason: null, access: null } }, "vy", now)?.text,
    "Прошлая оплата возвращена.",
  );
  const ended = paywallHistoryNote({
    lastRequest: { displayStatus: "confirmed", rejectionReason: null, access: { expiresAt: "2026-10-01T10:00:00Z" } },
  }, "ty", now);
  assert.equal(ended?.text, "Доступ закончился 01.10.2026. Оплати курс снова, чтобы продолжить.");
  const endedForParent = paywallHistoryNote({
    lastRequest: { displayStatus: "confirmed", rejectionReason: null, access: { expiresAt: "2026-10-01T10:00:00Z" } },
  }, "vy", now);
  assert.match(endedForParent?.text ?? "", /Оплатите курс снова/);
  // Access that still runs is not a reason to show a note.
  assert.equal(paywallHistoryNote({
    lastRequest: { displayStatus: "confirmed", rejectionReason: null, access: { expiresAt: "2027-05-02T10:00:00Z" } },
  }, "ty", now), null);
});

test("a new price comes from the details of the 409 and nothing else is trusted", () => {
  assert.equal(priceFromChangedDetails({ priceKzt: 15000 }), 15000);
  assert.equal(priceFromChangedDetails({ priceKzt: "15000" }), null);
  assert.equal(priceFromChangedDetails({ priceKzt: 0 }), null);
  assert.equal(priceFromChangedDetails(null), null);
  assert.equal(priceFromChangedDetails(undefined), null);
  assert.equal(priceChangedText(15000), "Цена изменилась: теперь 15 000 ₸");
  assert.match(priceChangedText(null), /Цена изменилась/);
});

test("the number to copy has digits only, the plus kept", () => {
  assert.equal(phoneForCopy("+7 777 123-45-67"), "+77771234567");
  assert.equal(phoneForCopy("8 (777) 123 45 67"), "87771234567");
});

test("only an https link opens as the payment page", () => {
  assert.equal(safePaymentUrl("https://pay.kaspi.kz/pay/abc"), "https://pay.kaspi.kz/pay/abc");
  assert.equal(safePaymentUrl(" https://pay.kaspi.kz/x "), "https://pay.kaspi.kz/x");
  assert.equal(safePaymentUrl("javascript:alert(1)"), null);
  assert.equal(safePaymentUrl("http://pay.example"), null);
  assert.equal(safePaymentUrl(""), null);
  assert.equal(safePaymentUrl(null), null);
});

test("request states are named for the person", () => {
  assert.equal(requestStatusLabel("pending"), "Ждём подтверждения оплаты");
  assert.equal(requestStatusLabel("confirmed"), "Оплата подтверждена");
  assert.equal(requestStatusLabel("refunded"), "Оплата возвращена");
  assert.match(requestStatusLabel("rejected"), /Оплата не найдена/);
});

test("the courses of a child: held and waiting first, then to buy, then the free", () => {
  const title = (name: string, view: CourseSaleView) => ({ ...view, title: name });
  const free = title("Б бесплатный", { priceKzt: null, includedInSchool: false, freeLessonsCount: 0, access: null });
  const buy = title("А платный", paidCourse());
  const held = title("Я купленный", paidCourse({ kind: "paid", expiresAt: "2027-05-02T10:00:00.000Z" }));
  const waiting = title("Я ждёт", paidCourse({ pendingPaymentRequest: { id: "r", createdAt: "2026-11-02T10:00:00Z" } }));
  const sorted = [free, buy, held, waiting].sort(childCourseSort).map((course) => course.title);
  assert.deepEqual(sorted, ["Я ждёт", "Я купленный", "А платный", "Б бесплатный"]);
});
