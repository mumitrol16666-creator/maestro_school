"use client";

import { KeyRound, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { PaymentActionDialog, type PaymentDialogRequest } from "@/components/payment-action-dialog";
import { ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { cmsApi } from "@/lib/cms-api";
import {
  announceCoursePaymentsChanged,
  coursePaymentsApi,
  type CourseAccessEntry,
} from "@/lib/course-payments-api";
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_STYLES,
  accessSourceLabel,
  addMonthsToDay,
  formatSchoolDate,
  formatTenge,
  revokeReasonLabel,
  schoolDay,
  schoolDayEndIso,
} from "@/lib/course-payments-format";

const PAYMENTS_PERMISSION = "course_payments.manage";

/** «Доступ к курсам» in the student's card: who holds which paid course, give and take back. */
export function StudentCourseAccessCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { user } = useAuth();
  if (!user?.permissions?.includes(PAYMENTS_PERMISSION)) return null;
  return <AccessCard studentId={studentId} studentName={studentName} />;
}

function AccessCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const list = useApiResource(() => coursePaymentsApi.studentAccess(studentId), [studentId]);
  const [dialog, setDialog] = useState<PaymentDialogRequest | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "info"; text: string } | null>(null);

  async function openGrant() {
    // The catalog is open to content admins; for other roles the picker says so.
    let options: Array<{ id: string; title: string; priceKzt: number }> = [];
    let catalogError = false;
    try {
      options = (await cmsApi.courses("", "", 1, 100)).data
        .filter((course) => !course.deletedAt && course.isPublished && course.priceKzt !== null)
        .map((course) => ({ id: course.id, title: course.title, priceKzt: course.priceKzt as number }));
    } catch {
      catalogError = true;
    }
    const today = schoolDay();
    const defaultUntil = addMonthsToDay(today, 6);
    const maxUntil = addMonthsToDay(today, 60);
    setDialog({
      title: "Выдать доступ к курсу",
      description: `${studentName} получит курс без оплаты. Причина сохранится в карточке и в журнале.`,
      confirmLabel: "Выдать доступ",
      field: {
        label: "Причина (обязательно)",
        placeholder: "Например: оплата наличными в школе",
        minLength: 3,
      },
      extra: {
        initial: { courseId: options[0]?.id ?? "", until: defaultUntil },
        problem: (values) => !values.courseId
          ? (catalogError ? "Список курсов недоступен для вашей роли." : "Нет платных опубликованных курсов.")
          : values.until <= today || values.until > maxUntil ? "Срок — от завтра и не дальше 5 лет." : null,
        render: (values, set) => (
          <>
            <label className="block text-sm font-bold text-stone-700">
              Курс
              <select value={values.courseId} onChange={(event) => set("courseId", event.target.value)} className={`${inputClass} mt-2 font-normal`} disabled={!options.length}>
                {options.length ? options.map((course) => (
                  <option key={course.id} value={course.id}>{course.title} — {formatTenge(course.priceKzt)}</option>
                )) : <option value="">Нет платных курсов</option>}
              </select>
            </label>
            <label className="block text-sm font-bold text-stone-700">
              Доступ до
              <input type="date" value={values.until} min={today} max={maxUntil} onChange={(event) => set("until", event.target.value)} className={`${inputClass} mt-2 font-normal`} />
              <span className="mt-1 block text-xs font-normal text-stone-500">По умолчанию 6 месяцев со дня выдачи. Дата включительно.</span>
            </label>
          </>
        ),
      },
      onConfirm: async (note, values) => {
        const edited = values.until !== defaultUntil;
        const access = await coursePaymentsApi.grantAccess(studentId, {
          courseId: values.courseId,
          note,
          ...(edited ? { expiresAt: schoolDayEndIso(values.until) } : {}),
        });
        setDialog(null);
        setNotice({ kind: "success", text: `Доступ к курсу «${access.course.title}» выдан до ${formatSchoolDate(access.expiresAt)}.` });
        announceCoursePaymentsChanged();
        await list.reload();
      },
    });
  }

  function openRevoke(entry: CourseAccessEntry) {
    setDialog({
      title: "Отозвать доступ?",
      description: `Курс «${entry.course.title}» закроется для ${studentName} сразу.${entry.source === "payment" ? " Оплата останется подтверждённой: если вы вернули деньги, нажмите «Возврат» в разделе «Оплаты курсов»." : ""}`,
      confirmLabel: "Отозвать доступ",
      tone: "danger",
      field: { label: "Заметка (необязательно)", placeholder: "Почему закрываете доступ", minLength: 0 },
      onConfirm: async (note) => {
        try {
          await coursePaymentsApi.revokeAccess(entry.id, note);
          setNotice({ kind: "success", text: `Доступ к курсу «${entry.course.title}» закрыт.` });
        } catch (reason) {
          if (!(reason instanceof ApiError && reason.status === 409)) throw reason;
          setNotice({ kind: "info", text: `${reason.message} Список обновлён.` });
        }
        setDialog(null);
        await list.reload();
      },
    });
  }

  const sorted = useMemo(() => list.data ?? [], [list.data]);

  return (
    <section className="mt-6 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="student-course-access">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Платные курсы</p>
          <h2 className="font-display mt-2 text-3xl">Доступ к курсам</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Оплаченные и выданные вручную доступы. Курсы, которые входят в обучение школы, открыты ученику без записи в этом списке.
          </p>
        </div>
        <button type="button" onClick={() => void openGrant()} className={`${primaryButton} w-full sm:w-auto`}>
          <Plus size={16} />Выдать доступ
        </button>
      </div>

      {notice ? (
        <p role="status" className={`mt-4 rounded-lg px-3 py-2.5 text-sm font-semibold ${notice.kind === "success" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{notice.text}</p>
      ) : null}

      <div className="mt-6">
        {list.loading && !list.data ? <LoadingState label="Загружаем доступы" /> : list.error && !list.data ? <ErrorState message={list.error} retry={list.reload} /> : !sorted.length ? (
          <p className="flex items-center gap-2 text-sm text-stone-500"><KeyRound size={16} />Платных доступов пока нет.</p>
        ) : (
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {sorted.map((entry) => (
              <li key={entry.id} data-testid="course-access-entry" className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="break-words text-ink">{entry.course.title}</strong>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${ACCESS_STATUS_STYLES[entry.status]}`}>{ACCESS_STATUS_LABELS[entry.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {accessSourceLabel(entry.source)}
                    {entry.payment ? `, ${formatTenge(entry.payment.amountKzt)}` : ""}
                    {" · "}с {formatSchoolDate(entry.startsAt)} до {formatSchoolDate(entry.expiresAt)}
                  </p>
                  {entry.grantNote ? <p className="mt-1 break-words text-sm text-stone-600">Причина выдачи: {entry.grantNote}</p> : null}
                  {entry.grantedBy ? <p className="mt-0.5 text-xs text-stone-500">{entry.source === "payment" ? "Подтвердил" : "Выдал"}: {entry.grantedBy.name}</p> : null}
                  {entry.revokedAt ? (
                    <p className="mt-1 break-words text-sm text-red-700">
                      Закрыт {formatSchoolDate(entry.revokedAt)}: {revokeReasonLabel(entry.revokeReason)}{entry.revokedBy ? `, ${entry.revokedBy.name}` : ""}{entry.revokeNote ? `. ${entry.revokeNote}` : ""}
                    </p>
                  ) : null}
                </div>
                {entry.status === "active" || entry.status === "scheduled" ? (
                  <button type="button" onClick={() => openRevoke(entry)} className={`${secondaryButton} w-full shrink-0 sm:w-auto`}>Отозвать</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <PaymentActionDialog request={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}
