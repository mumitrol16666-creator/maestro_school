import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsToDay,
  formatSchoolDate,
  formatSchoolDateTime,
  formatTenge,
  freeLessonIds,
  parseCoursePrice,
  parseFreeLessons,
  paymentFiltersQuery,
  schoolDay,
  schoolDayEndIso,
  sumStandingPayments,
} from "../../src/lib/course-payments-format";

test("money is written with spaces and the tenge sign", () => {
  assert.equal(formatTenge(12000), "12 000 ₸");
  assert.equal(formatTenge(500), "500 ₸");
  assert.equal(formatTenge(1250000), "1 250 000 ₸");
});

test("dates are shown in school time (UTC+5), also across midnight", () => {
  // 19:30 UTC on 1 Nov is already 00:30 on 2 Nov at the school.
  assert.equal(formatSchoolDate("2026-11-01T19:30:00.000Z"), "02.11.2026");
  assert.equal(formatSchoolDateTime("2026-11-01T19:30:00.000Z"), "02.11.2026, 00:30");
  assert.equal(schoolDay("2026-11-01T18:59:00.000Z"), "2026-11-01");
  assert.equal(schoolDay("2026-11-01T19:00:00.000Z"), "2026-11-02");
  assert.equal(formatSchoolDateTime("2026-11-02T10:05:00.000Z"), "02.11.2026, 15:05");
});

test("six months from a day: calendar months, the month end is kept", () => {
  assert.equal(addMonthsToDay("2026-11-02", 6), "2027-05-02");
  assert.equal(addMonthsToDay("2026-08-31", 6), "2027-02-28");
  assert.equal(addMonthsToDay("2027-08-31", 6), "2028-02-29");
  assert.equal(addMonthsToDay("2026-12-15", 6), "2027-06-15");
  assert.equal(schoolDayEndIso("2027-05-02"), "2027-05-02T23:59:00+05:00");
  assert.equal(new Date(schoolDayEndIso("2027-05-02")).toISOString(), "2027-05-02T18:59:00.000Z");
});

test("the query keeps only filled filters", () => {
  assert.equal(paymentFiltersQuery({}), "");
  assert.equal(
    paymentFiltersQuery({ status: "confirmed", courseId: "c1", from: "2026-11-01", to: "2026-11-30", search: "  Алия " }, { page: 2, limit: 20 }),
    "status=confirmed&courseId=c1&from=2026-11-01&to=2026-11-30&search=%D0%90%D0%BB%D0%B8%D1%8F&page=2&limit=20",
  );
  assert.equal(paymentFiltersQuery({ status: "", search: "   " }), "");
});

test("the sum counts confirmed payments only, a refund and a rejection do not count", () => {
  assert.deepEqual(
    sumStandingPayments([
      { displayStatus: "confirmed", amountKzt: 12000 },
      { displayStatus: "refunded", amountKzt: 12000 },
      { displayStatus: "rejected", amountKzt: 9000 },
      { displayStatus: "pending", amountKzt: 9000 },
      { displayStatus: "confirmed", amountKzt: 8000 },
    ]),
    { count: 2, amountKzt: 20000 },
  );
  assert.deepEqual(sumStandingPayments([]), { count: 0, amountKzt: 0 });
});

test("a price: empty is free, spaces are fine, zero, fractions and letters are refused", () => {
  assert.deepEqual(parseCoursePrice(""), { ok: true, value: null });
  assert.deepEqual(parseCoursePrice("   "), { ok: true, value: null });
  assert.deepEqual(parseCoursePrice("12 000"), { ok: true, value: 12000 });
  assert.deepEqual(parseCoursePrice("12000"), { ok: true, value: 12000 });
  assert.deepEqual(parseCoursePrice("1"), { ok: true, value: 1 });
  for (const bad of ["0", "-5", "12.5", "12,5", "abc", "12 ₸", "1000000000"]) {
    assert.equal(parseCoursePrice(bad).ok, false, bad);
  }
});

test("free lessons: 0..50 whole numbers", () => {
  assert.deepEqual(parseFreeLessons("2"), { ok: true, value: 2 });
  assert.deepEqual(parseFreeLessons("0"), { ok: true, value: 0 });
  assert.deepEqual(parseFreeLessons("50"), { ok: true, value: 50 });
  for (const bad of ["", "-1", "51", "1.5", "два"]) assert.equal(parseFreeLessons(bad).ok, false, bad);
});

test("free lessons are the first published ones through all modules", () => {
  const modules = [
    { lessons: [{ id: "a", isPublished: true }, { id: "draft", isPublished: false }, { id: "b", isPublished: true }] },
    { lessons: [{ id: "c", isPublished: true }] },
  ];
  assert.deepEqual([...freeLessonIds(modules, 2)], ["a", "b"]);
  assert.deepEqual([...freeLessonIds(modules, 3)], ["a", "b", "c"]);
  assert.deepEqual([...freeLessonIds(modules, 0)], []);
  assert.deepEqual([...freeLessonIds(modules, 50)], ["a", "b", "c"]);
});
