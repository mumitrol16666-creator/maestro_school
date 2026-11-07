import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarMonths,
  buildCsv,
  buildPaymentsCsv,
  COURSE_ACCESS_MONTHS,
  csvTextCell,
  formatSchoolDate,
  formatSchoolDateTime,
  formatTenge,
  paidAccessExpiry,
  parsePeriodEndExclusive,
  parsePeriodStart,
  paymentDisplayStatus,
  PAYMENT_CSV_HEADER,
} from "./course-payments.js";
import { accessGrantIsCurrent } from "./course-access.js";

const iso = (date: Date) => date.toISOString();

test("paid access lasts six calendar months and keeps the time of day", () => {
  assert.equal(COURSE_ACCESS_MONTHS, 6);
  assert.equal(iso(paidAccessExpiry(new Date("2026-11-02T10:15:30.123Z"))), "2027-05-02T10:15:30.123Z");
  assert.equal(iso(addCalendarMonths(new Date("2026-08-15T00:00:00.000Z"), 6)), "2027-02-15T00:00:00.000Z");
});

test("a day the target month does not have falls on the last day of that month", () => {
  assert.equal(iso(addCalendarMonths(new Date("2026-08-31T12:00:00.000Z"), 6)), "2027-02-28T12:00:00.000Z");
  assert.equal(iso(addCalendarMonths(new Date("2027-08-31T12:00:00.000Z"), 6)), "2028-02-29T12:00:00.000Z", "leap year");
  assert.equal(iso(addCalendarMonths(new Date("2026-03-31T00:00:00.000Z"), 6)), "2026-09-30T00:00:00.000Z");
  assert.equal(iso(addCalendarMonths(new Date("2026-12-31T00:00:00.000Z"), 6)), "2027-06-30T00:00:00.000Z");
});

test("the access is current up to the last millisecond before the end and not at it", () => {
  const startsAt = new Date("2026-11-02T10:00:00.000Z");
  const grant = { source: "payment" as const, startsAt, expiresAt: paidAccessExpiry(startsAt), revokedAt: null };
  assert.equal(accessGrantIsCurrent(grant, new Date(grant.expiresAt.getTime() - 1)), true);
  assert.equal(accessGrantIsCurrent(grant, grant.expiresAt), false);
  assert.equal(accessGrantIsCurrent(grant, startsAt), true);
});

test("a refunded confirmed request is shown as refunded, nothing else changes the status", () => {
  const at = new Date();
  assert.equal(paymentDisplayStatus({ status: "pending", refundedAt: null }), "pending");
  assert.equal(paymentDisplayStatus({ status: "confirmed", refundedAt: null }), "confirmed");
  assert.equal(paymentDisplayStatus({ status: "confirmed", refundedAt: at }), "refunded");
  assert.equal(paymentDisplayStatus({ status: "rejected", refundedAt: null }), "rejected");
});

test("a text cell that could run as a formula gets an apostrophe", () => {
  for (const start of ["=", "+", "-", "@"]) {
    assert.equal(csvTextCell(`${start}1+1`), `'${start}1+1`, start);
  }
  assert.equal(csvTextCell("\t=1"), "'\t=1");
  assert.equal(csvTextCell("Иван"), "Иван");
  assert.equal(csvTextCell("2026-11-02 15:30"), "2026-11-02 15:30");
  assert.equal(csvTextCell(null), "");
  assert.equal(csvTextCell("a-b=c"), "a-b=c", "only the start matters");
});

test("quotes, the separator and line breaks are escaped", () => {
  assert.equal(csvTextCell('Иван "Пётр"'), '"Иван ""Пётр"""');
  assert.equal(csvTextCell("а;б"), '"а;б"');
  assert.equal(csvTextCell("строка\nвторая"), '"строка\nвторая"');
  assert.equal(csvTextCell("строка\r\nвторая"), '"строка\nвторая"');
  assert.equal(csvTextCell('=A1;"x"'), `"'=A1;""x"""`, "formula guard first, then quoting");
});

test("the table is UTF-8 with BOM, separated by ; and ends in CRLF", () => {
  const csv = buildCsv(["Один", "Два"], [["1", "2"]]);
  assert.equal(csv, "﻿Один;Два\r\n1;2\r\n");
  assert.equal(Buffer.from(csv).subarray(0, 3).toString("hex"), "efbbbf");
});

test("a payment row has the eleven columns in order; the phone is digits only", () => {
  const csv = buildPaymentsCsv([{
    createdAt: "2026-11-02 15:30",
    decidedAt: "",
    studentName: "=Петров Иван",
    studentPhone: "+7 (701) 234-56-78",
    payerName: "Петрова Анна (родитель)",
    courseTitle: "Гитара; с нуля",
    amountKzt: 15000,
    status: "pending",
    deciderName: "",
    note: '"срочно"',
    refund: "",
  }]);
  const [header, row] = csv.replace("﻿", "").split("\r\n");
  assert.equal(header.split(";").length, PAYMENT_CSV_HEADER.length);
  assert.equal(row, `2026-11-02 15:30;;'=Петров Иван;77012345678;Петрова Анна (родитель);"Гитара; с нуля";15000;Ждёт проверки;;"""срочно""";`);
});

test("period bounds: a bare date is a school day (UTC+5), a moment stays itself", () => {
  assert.equal(iso(parsePeriodStart("2026-11-02")!), "2026-11-01T19:00:00.000Z");
  assert.equal(iso(parsePeriodEndExclusive("2026-11-02")!), "2026-11-02T19:00:00.000Z");
  assert.equal(iso(parsePeriodEndExclusive("2026-11-02T08:00:00.000Z")!), "2026-11-02T08:00:00.000Z");
  assert.equal(parsePeriodStart("not a date"), null);
  assert.equal(parsePeriodEndExclusive("2026-13-45"), null);
});

test("dates and amounts for people", () => {
  const moment = new Date("2026-11-02T10:05:00.000Z");
  assert.equal(formatSchoolDateTime(moment), "2026-11-02 15:05");
  assert.equal(formatSchoolDate(moment), "02.11.2026");
  assert.equal(formatSchoolDate(new Date("2026-11-02T20:00:00.000Z")), "03.11.2026", "late evening UTC is already tomorrow in Aqtobe");
  assert.equal(formatTenge(15000), "15 000 ₸");
  assert.equal(formatTenge(990), "990 ₸");
  assert.equal(formatTenge(1250000), "1 250 000 ₸");
});
