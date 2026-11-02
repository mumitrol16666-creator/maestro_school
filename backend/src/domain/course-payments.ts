/**
 * Stage 4: rules of course payments that need no database — the access period, the status the
 * administrator sees, and the CSV table of payments.
 */

/** Paid access lasts 6 calendar months from the moment the administrator confirms the payment. */
export const COURSE_ACCESS_MONTHS = 6;

/**
 * Adds calendar months in UTC and keeps the day when the target month has it; otherwise the last
 * day of the target month (31 Aug + 6 months = 28 Feb, 29 in a leap year). Time of day is kept.
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(from.getUTCDate(), lastDay),
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  ));
}

/** The expiry date of a paid access that starts at `confirmedAt`. */
export function paidAccessExpiry(confirmedAt: Date): Date {
  return addCalendarMonths(confirmedAt, COURSE_ACCESS_MONTHS);
}

/**
 * A request is stored as pending / confirmed / rejected; a refund is a mark on a confirmed one.
 * «access_revoked» is a confirmed payment, not refunded, whose access the administrator closed by
 * hand: the money was accepted, the lessons are closed.
 */
export type CoursePaymentDisplayStatus = "pending" | "confirmed" | "rejected" | "refunded" | "access_revoked";

export function paymentDisplayStatus(request: {
  status: "pending" | "confirmed" | "rejected";
  refundedAt: Date | null;
  access?: { revokedAt: Date | null } | null;
}): CoursePaymentDisplayStatus {
  if (request.status === "confirmed" && request.refundedAt) return "refunded";
  if (request.status === "confirmed" && request.access?.revokedAt) return "access_revoked";
  return request.status;
}

export const PAYMENT_STATUS_LABEL: Record<CoursePaymentDisplayStatus, string> = {
  pending: "Ждёт проверки",
  confirmed: "Подтверждена",
  rejected: "Отклонена",
  refunded: "Возвращена",
  access_revoked: "Подтверждена, доступ закрыт",
};

/**
 * One text cell of the CSV. A cell that starts with = + - @ (or a tab / carriage return) would be
 * run as a formula by Excel, so it gets a leading apostrophe; then quotes, the separator and line
 * breaks are escaped the usual way.
 */
export function csvTextCell(value: string | null | undefined): string {
  let text = (value ?? "").replace(/\r\n|\r/g, "\n");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return csvCell(text);
}

/** Quotes a cell when it holds the separator, a quote or a line break. Does not guard formulas. */
export function csvCell(text: string): string {
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_BOM = "﻿";

/** UTF-8 with BOM, `;` as separator, CRLF line ends: opens in Excel as is. */
export function buildCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header.map(csvCell).join(";"), ...rows.map((row) => row.join(";"))];
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

export const PAYMENT_CSV_HEADER = [
  "Дата заявки",
  "Дата решения",
  "Ученик",
  "Телефон",
  "Плательщик",
  "Курс",
  "Сумма, ₸",
  "Статус",
  "Кто решил",
  "Заметка",
  "Возврат",
] as const;

export interface PaymentCsvRow {
  createdAt: string;
  decidedAt: string;
  studentName: string;
  studentPhone: string;
  payerName: string;
  courseTitle: string;
  amountKzt: number;
  status: CoursePaymentDisplayStatus;
  deciderName: string;
  note: string;
  refund: string;
}

/** Phones go out as digits only: a leading + would look like a formula start. */
export function buildPaymentsCsv(rows: readonly PaymentCsvRow[]): string {
  return buildCsv(
    PAYMENT_CSV_HEADER,
    rows.map((row) => [
      csvTextCell(row.createdAt),
      csvTextCell(row.decidedAt),
      csvTextCell(row.studentName),
      csvTextCell(row.studentPhone.replace(/\D/g, "")),
      csvTextCell(row.payerName),
      csvTextCell(row.courseTitle),
      String(Math.trunc(row.amountKzt)),
      csvTextCell(PAYMENT_STATUS_LABEL[row.status]),
      csvTextCell(row.deciderName),
      csvTextCell(row.note),
      csvTextCell(row.refund),
    ]),
  );
}

const SCHOOL_UTC_OFFSET_HOURS = 5; // Asia/Aqtobe, no daylight saving time
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Start of a filter period: a bare date is the school day (UTC+5), anything else is read as a moment. */
export function parsePeriodStart(value: string): Date | null {
  if (DAY_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() - SCHOOL_UTC_OFFSET_HOURS * 3_600_000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** End of a filter period, exclusive: a bare date includes the whole school day. */
export function parsePeriodEndExclusive(value: string): Date | null {
  const start = parsePeriodStart(value);
  if (!start) return null;
  return DAY_ONLY.test(value) ? new Date(start.getTime() + 86_400_000) : start;
}

/** «2026-11-02 15:30» in school time, for the table. */
export function formatSchoolDateTime(date: Date): string {
  const shifted = new Date(date.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** «02.11.2026» in school time, for people. */
export function formatSchoolDate(date: Date): string {
  const shifted = new Date(date.getTime() + SCHOOL_UTC_OFFSET_HOURS * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(shifted.getUTCDate())}.${pad(shifted.getUTCMonth() + 1)}.${shifted.getUTCFullYear()}`;
}

/** 15000 -> «15 000 ₸» (a plain space, safe for messengers). */
export function formatTenge(amount: number): string {
  return `${String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;
}
