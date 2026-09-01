import { CalendarDays } from "lucide-react";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";

const completeMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthOptions = [
  { value: "01", label: "Январь" },
  { value: "02", label: "Февраль" },
  { value: "03", label: "Март" },
  { value: "04", label: "Апрель" },
  { value: "05", label: "Май" },
  { value: "06", label: "Июнь" },
  { value: "07", label: "Июль" },
  { value: "08", label: "Август" },
  { value: "09", label: "Сентябрь" },
  { value: "10", label: "Октябрь" },
  { value: "11", label: "Ноябрь" },
  { value: "12", label: "Декабрь" },
];

export function PlanMonthField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const safeValue = completeMonthPattern.test(value) ? value : currentAqtobeMonth();
  const [year, month] = safeValue.split("-");
  const selectedYear = Number(year);
  const years = Array.from({ length: 21 }, (_, index) => selectedYear - 10 + index);

  return (
    <fieldset className="min-w-0">
      <legend className="text-[10px] font-black uppercase tracking-wider text-stone-500">
        Месяц плана
      </legend>
      <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_108px] gap-2">
        <span className="relative block min-w-0">
          <CalendarDays
            aria-hidden="true"
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-700"
          />
          <select
            aria-label="Месяц плана"
            value={month}
            onChange={(event) => onChange(`${year}-${event.target.value}`)}
            className="h-11 min-w-0 w-full rounded-xl border border-amber-200 bg-white pl-10 pr-8 text-sm font-bold normal-case tracking-normal text-ink shadow-xs outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </span>
        <select
          aria-label="Год плана"
          value={year}
          onChange={(event) => onChange(`${event.target.value}-${month}`)}
          className="h-11 min-w-0 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-ink shadow-xs outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        >
          {years.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
