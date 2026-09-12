import type {
  SchoolOfflineMembership,
  StudentOfflineSummary,
} from "@/types/school-offline";
import { schoolDateLabel as formatLessonDate } from "@/lib/student-lesson-display";
const membershipTypeLabels: Record<string, string> = {
  trial: "Пробное занятие",
  monthly: "Абонемент на месяц",
  monthly_12: "Абонемент на 12 занятий",
  quarterly: "Абонемент на 3 месяца",
  individual_single: "Индивидуальное занятие",
  individual_package: "Индивидуальный формат",
  single_class: "Разовое занятие",
  single_lesson: "Разовое занятие",
  custom: "Индивидуальный формат",
  hybrid_1: "Гибридный формат",
  hybrid_1m: "Гибридный формат",
  hybrid_2m: "Гибридный формат",
  group_evening: "Групповой формат",
  group_mini: "Мини-группа",
  duet: "Дуо",
  individual_1_2: "Индивидуальный формат",
  individual_2_2: "Индивидуальный формат",
  individual_4_long: "Индивидуальный формат",
  individual_archived: "Индивидуальный формат",
  individual_1: "Индивидуальный формат",
  individual_2: "Индивидуальный формат",
  individual_3: "Индивидуальный формат",
  individual_4: "Индивидуальный формат",
  individual_8_25: "Индивидуальный формат",
  individual_year: "Индивидуальный формат",
  theory: "Теория",
  quartet_only: "Квартет",
};

const membershipFormatLabels: Record<string, string> = {
  individual: "Индивидуальный формат",
  personal: "Индивидуальный формат",
  hybrid: "Гибридный формат",
  mixed: "Гибридный формат",
  group: "Групповой формат",
  quartet: "Квартет",
  duet: "Дуо",
  theory: "Теория",
  trial: "Пробное занятие",
};

function isTechnicalMembershipName(value: string) {
  return (
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(value) ||
    /^абонемент\s*\d+$/i.test(value) ||
    /^индивидуальн(?:ый|ая)\s+\d+(?:[-–]\d+)?$/i.test(value)
  );
}

function membershipDisplayName(membership: SchoolOfflineMembership) {
  const planName = membership.planName?.trim();
  if (planName && !isTechnicalMembershipName(planName)) return planName;

  return (
    membershipTypeLabels[membership.type] ||
    membershipFormatLabels[membership.lessonFormat] ||
    "Абонемент Maestro"
  );
}

function membershipDisplayDetails(membership: SchoolOfflineMembership) {
  const groupName = membership.groupName?.trim();
  const normalizedGroupName = groupName?.toLocaleLowerCase("ru-RU");
  const visibleGroupName =
    normalizedGroupName &&
    !["общий", "без группы"].includes(normalizedGroupName)
      ? groupName
      : null;

  return [
    membership.directionName?.trim(),
    visibleGroupName,
    membership.teacherName?.trim(),
  ]
    .filter(
      (value, index, values): value is string =>
        Boolean(value) && values.indexOf(value) === index,
    )
    .join(" · ");
}

export function StudentMemberships({
  balanceSnapshot,
}: {
  balanceSnapshot: StudentOfflineSummary["balanceSnapshot"];
}) {
  return (
    <section
      id="billing"
      aria-label="Абонемент и оплата"
      className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"
    >
      <h2 className="text-lg font-bold">Абонемент и оплата</h2>
      <div className="my-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>
          Баланс:{" "}
          <strong>
            {balanceSnapshot.accountBalanceKzt.toLocaleString("ru-RU")} ₸
          </strong>
        </p>
        <p
          className={
            balanceSnapshot.debtAmountKzt > 0
              ? "text-red-700"
              : "text-stone-500"
          }
        >
          {balanceSnapshot.debtAmountKzt > 0
            ? `К оплате: ${balanceSnapshot.debtAmountKzt.toLocaleString("ru-RU")} ₸`
            : "По абонементам долга нет"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {balanceSnapshot.memberships.map((m) => (
          <div
            key={m.crmMembershipId}
            className="rounded-xl border border-stone-200 bg-stone-50 p-3"
          >
            <div className="flex items-end gap-2">
              <p className="text-xl font-bold leading-none text-ink">
                {m.classesRemaining}
              </p>
              <p className="pb-0.5 text-xs font-semibold text-stone-500">
                занятий осталось
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold text-stone-800">
              {membershipDisplayName(m)}
            </p>
            {membershipDisplayDetails(m) ? (
              <p className="mt-1 text-xs text-stone-500">
                {membershipDisplayDetails(m)}
              </p>
            ) : null}
            <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
              <p>Всего в пакете: {m.totalClasses} занятий</p>
              <p className="mt-1">Действует до {formatLessonDate(m.endDate)}</p>
            </div>
            {m.remainingAmountKzt > 0 ? (
              <p className="mt-3 text-xs font-bold text-red-700">
                Долг: {m.remainingAmountKzt.toLocaleString("ru-RU")} ₸
              </p>
            ) : null}
            {m.individualClassesRemaining !== null &&
              m.individualClassesRemaining !== undefined && (
                <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Индивидуальные:</span>
                    <span className="font-semibold text-stone-800">
                      {m.individualClassesRemaining}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Групповые:</span>
                    <span className="font-semibold text-stone-800">
                      {m.groupClassesRemaining}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Теория:</span>
                    <span className="font-semibold text-stone-800">
                      {m.theoryClassesRemaining}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Экстренные заморозки:</span>
                    <span className="font-semibold text-stone-800">
                      {m.emergencyFreezesAvailable} (исп.{" "}
                      {m.emergencyFreezesUsed ?? 0})
                    </span>
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>
      {!balanceSnapshot.memberships.length ? (
        <p className="text-sm text-stone-500">Активных абонементов нет.</p>
      ) : null}
    </section>
  );
}
