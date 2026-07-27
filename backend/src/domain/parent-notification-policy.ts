export type ParentOfflineEvent =
  | "approved"
  | "returned"
  | "cancelled"
  | "rescheduled";

export function shouldNotifyParentForOfflineEvent(event: ParentOfflineEvent) {
  return event !== "returned";
}

export function parentOfflineEventType(
  event: ParentOfflineEvent,
  attended?: boolean | null,
) {
  if (event === "approved") {
    return attended === false
      ? "parent_absence_alert" as const
      : "parent_lesson_report_ready" as const;
  }
  if (event === "cancelled") return "parent_lesson_cancelled" as const;
  if (event === "rescheduled") return "parent_schedule_changed" as const;
  return null;
}

export function parentBalanceAlert(snapshot: {
  classesRemainingTotal?: number | null;
  debtAmountKzt?: number | null;
}) {
  const debt = Number(snapshot.debtAmountKzt);
  const classesRemaining = Number(snapshot.classesRemainingTotal);
  if (Number.isFinite(debt) && debt > 0) {
    return {
      kind: "debt" as const,
      value: debt,
      title: "Есть сумма к оплате",
      body: `К оплате: ${debt.toLocaleString("ru-RU")} ₸.`,
    };
  }
  if (Number.isFinite(classesRemaining) && classesRemaining <= 1) {
    return {
      kind: "low_classes" as const,
      value: classesRemaining,
      title: "Заканчиваются занятия",
      body: classesRemaining === 1
        ? "В абонементе осталось одно занятие."
        : "В абонементе не осталось занятий.",
    };
  }
  return null;
}
