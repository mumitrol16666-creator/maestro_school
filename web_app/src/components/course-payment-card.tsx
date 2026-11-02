"use client";

import { AlertTriangle, Check, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { primaryButton, secondaryButton } from "@/components/admin-ui";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  formatSchoolDate,
  formatSchoolDateTime,
  formatTenge,
} from "@/lib/course-payments-format";
import type { AdminPaymentRequest } from "@/lib/course-payments-api";
import { formatPhoneDisplay, normalizePhoneDigits } from "@/lib/phone";

export function Money({ value }: { value: number }) {
  return <span className="whitespace-nowrap">{formatTenge(value)}</span>;
}

function PhoneLink({ phone, tall = false }: { phone: string | null; tall?: boolean }) {
  if (!phone) return <span className="text-stone-400">телефон не указан</span>;
  return (
    <a href={`tel:+${normalizePhoneDigits(phone)}`} className={`${tall ? "inline-flex min-h-11 items-center" : ""} whitespace-nowrap font-semibold text-stone-700 underline decoration-stone-300 underline-offset-2`}>
      {formatPhoneDisplay(phone)}
    </a>
  );
}

export interface PaymentCardActions {
  onConfirm: (item: AdminPaymentRequest) => void;
  onReject: (item: AdminPaymentRequest) => void;
  onRefund: (item: AdminPaymentRequest) => void;
}

/**
 * One request of a payer: who, what, how much, what they wrote, and the decisions that are still
 * possible for its status (a waiting one is confirmed or rejected, a confirmed one is refunded).
 */
export function CoursePaymentCard({
  item,
  actions,
  highlighted = false,
}: {
  item: AdminPaymentRequest;
  actions: PaymentCardActions;
  highlighted?: boolean;
}) {
  const priceChanged = item.currentPriceKzt !== null && item.currentPriceKzt !== item.amountKzt;
  return (
    <article
      data-testid="course-payment-card"
      data-request-id={item.id}
      data-status={item.displayStatus}
      className={`rounded-[22px] border bg-paper p-4 shadow-soft sm:p-5 ${highlighted ? "border-gold ring-2 ring-gold/40" : "border-stone-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="break-words font-display text-xl leading-tight sm:text-2xl">
            <Link href={`/admin/students/${item.student.id}`} className="inline-flex min-h-11 items-center hover:underline">{item.student.name}</Link>
          </h3>
          <p className="text-sm text-stone-600"><PhoneLink phone={item.student.phone} tall /></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${PAYMENT_STATUS_STYLES[item.displayStatus]}`}>
            {PAYMENT_STATUS_LABELS[item.displayStatus]}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Курс</dt>
          <dd className="mt-0.5 break-words font-semibold text-ink">{item.course.title}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Сумма</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            <Money value={item.amountKzt} />
            {priceChanged ? (
              <span className="ml-2 text-xs font-normal text-stone-500">
                сейчас курс стоит <Money value={item.currentPriceKzt!} />
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Заявка отправлена</dt>
          <dd className="mt-0.5 text-stone-700">{formatSchoolDateTime(item.createdAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wider text-stone-500">Кто платил</dt>
          <dd className="mt-0.5 break-words text-stone-700">
            {item.payer.isStudent ? "Сам ученик" : (
              <>Родитель: <span className="font-semibold">{item.payer.name}</span>, <PhoneLink phone={item.payer.phone} /></>
            )}
          </dd>
        </div>
      </dl>

      {item.payerNote ? (
        <p className="mt-3 break-words rounded-lg bg-stone-50 px-3 py-2.5 text-sm leading-6 text-stone-700">
          <span className="font-bold text-stone-500">Комментарий плательщика: </span>{item.payerNote}
        </p>
      ) : null}

      {item.repeatPurchase ? (
        <p data-testid="repeat-purchase" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-5 text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            У ученика уже есть доступ к этому курсу до {formatSchoolDate(item.repeatPurchase.currentExpiresAt)}
            {item.repeatPurchase.source === "admin_grant" ? " (выдан вручную)" : " (оплачен)"}.
            Подтверждение откроет ещё один доступ на 6 месяцев со дня подтверждения, старый срок не продлевается.
          </span>
        </p>
      ) : null}

      {item.displayStatus === "rejected" ? (
        <p className="mt-3 break-words text-sm text-stone-700">
          <span className="font-bold text-stone-500">Причина, её видит ученик: </span>{item.decisionNote ?? "не указана"}
          {item.decidedBy ? <span className="block text-xs text-stone-500">{item.decidedBy.name}, {item.decidedAt ? formatSchoolDateTime(item.decidedAt) : ""}</span> : null}
        </p>
      ) : null}

      {item.displayStatus === "confirmed" || item.displayStatus === "refunded" ? (
        <p className="mt-3 break-words text-sm text-stone-700">
          <span className="font-bold text-stone-500">Подтвердил: </span>
          {item.decidedBy?.name ?? "—"}{item.decidedAt ? `, ${formatSchoolDateTime(item.decidedAt)}` : ""}
          {item.access && !item.access.revokedAt ? `. Доступ до ${formatSchoolDate(item.access.expiresAt)}` : ""}
        </p>
      ) : null}

      {item.displayStatus === "refunded" ? (
        <p className="mt-2 break-words text-sm text-stone-700">
          <span className="font-bold text-stone-500">Возврат: </span>
          {item.refundedBy?.name ?? "—"}{item.refundedAt ? `, ${formatSchoolDateTime(item.refundedAt)}` : ""}
          {item.refundNote ? `. ${item.refundNote}` : ""}
        </p>
      ) : null}

      {item.displayStatus === "pending" ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => actions.onConfirm(item)} className={`${primaryButton} w-full sm:w-auto`}>
            <Check size={16} />Подтвердить и открыть
          </button>
          <button type="button" onClick={() => actions.onReject(item)} className={`${secondaryButton} w-full sm:w-auto`}>
            <XCircle size={16} />Оплата не найдена
          </button>
        </div>
      ) : null}
      {item.displayStatus === "confirmed" ? (
        <div className="mt-4">
          <button type="button" onClick={() => actions.onRefund(item)} className={`${secondaryButton} w-full sm:w-auto`}>
            <RotateCcw size={16} />Возврат
          </button>
        </div>
      ) : null}
    </article>
  );
}
