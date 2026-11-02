"use client";

import { BellRing, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { practiceApi } from "@/lib/api-client";
import type { PracticeReminderSettings } from "@/types/api";

const weekdays = [
  { value: 1, label: "Пн" }, { value: 2, label: "Вт" }, { value: 3, label: "Ср" }, { value: 4, label: "Чт" },
  { value: 5, label: "Пт" }, { value: 6, label: "Сб" }, { value: 0, label: "Вс" },
];

/** Plan 5.6: when to remind «пора взять гитару» — days and time; off until the student turns it on. */
export function PracticeReminderCard() {
  const [settings, setSettings] = useState<PracticeReminderSettings | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    practiceApi.status().then((data) => setSettings(data.reminder)).catch(() => setSettings({ enabled: false, time: "18:00", days: [0, 1, 2, 3, 4, 5, 6] }));
  }, []);

  async function save(next: PracticeReminderSettings) {
    setSettings(next);
    setStatus("saving");
    try {
      const saved = await practiceApi.saveReminder(next);
      setSettings(saved);
      setStatus("idle");
      toast.success("Напоминание сохранено");
    } catch {
      setStatus("error");
      toast.error("Не получилось сохранить напоминание. Попробуй ещё раз");
    }
  }

  if (!settings) return null;
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-5 sm:p-6" data-testid="practice-reminder-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-gold-ink"><BellRing size={15} /> Напоминание заниматься</p>
          <h2 className="font-display mt-2 text-2xl">Пора взять гитару</h2>
          <p className="mt-1 text-sm text-stone-500">Одно короткое напоминание в день, в дни без урока. Фразы — с подколкой, без занудства.</p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => void save({ ...settings, enabled: event.target.checked })}
            className="h-5 w-5 accent-amber-600"
            aria-label="Напоминать заниматься"
          />
          {settings.enabled ? "Вкл" : "Выкл"}
        </label>
      </div>
      <div className={`mt-4 grid gap-4 sm:grid-cols-[auto_1fr] ${settings.enabled ? "" : "opacity-50"}`}>
        <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
          Время
          <input
            type="time"
            value={settings.time}
            disabled={!settings.enabled}
            onChange={(event) => void save({ ...settings, time: event.target.value })}
            className="mt-1 block h-11 rounded-xl border border-stone-200 px-3 text-base font-bold text-ink"
            aria-label="Время напоминания"
          />
        </label>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Дни</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {weekdays.map((day) => {
              const on = settings.days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  disabled={!settings.enabled}
                  aria-pressed={on}
                  onClick={() => {
                    const days = on ? settings.days.filter((value) => value !== day.value) : [...settings.days, day.value];
                    if (!days.length) return;
                    void save({ ...settings, days });
                  }}
                  className={`min-h-10 min-w-11 rounded-xl border px-3 text-sm font-bold ${on ? "border-amber-600 bg-amber-50 text-amber-950" : "border-stone-200 bg-white text-stone-500"}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-stone-500" role="status">
        {status === "saving" ? <span className="inline-flex items-center gap-1"><LoaderCircle size={12} className="animate-spin" /> Сохраняем…</span>
          : status === "error" ? "Не удалось сохранить" : "В день урока напоминание не приходит."}
      </p>
    </section>
  );
}
