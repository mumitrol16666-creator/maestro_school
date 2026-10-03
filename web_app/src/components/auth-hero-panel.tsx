import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import type { AuthProfile } from "@/components/auth-platform-preview";

const content: Record<AuthProfile, {
  heading: string;
  description: string;
  highlights: readonly string[];
  footer: string;
}> = {
  student: {
    heading: "Твой музыкальный прогресс в одном кабинете",
    description: "Уроки, домашние задания, проверка преподавателя, онлайн-занятия и достижения Maestro собраны в одной системе.",
    highlights: [
      "курсы и материалы по шагам",
      "домашние задания с проверкой",
      "онлайн-уроки с преподавателем",
      "баллы, достижения и Maestro Coins",
    ],
    footer: "Личный кабинет ученика музыкальной школы Maestro",
  },
  parent: {
    heading: "Главное об обучении ребёнка в одном кабинете",
    description: "Расписание, баланс, учебный план и достижения ребёнка доступны в понятном семейном формате.",
    highlights: [
      "ближайшие занятия и преподаватели",
      "баланс и состояние оплаты",
      "прогресс по учебному плану",
      "новости и сообщения школы",
    ],
    footer: "Семейный кабинет музыкальной школы Maestro",
  },
  staff: {
    heading: "Учебная работа школы в одном кабинете",
    description: "Расписание, отчёты по урокам, домашние задания, ученики и сообщения собраны в едином рабочем пространстве.",
    highlights: [
      "уроки и отчёты по понятным статусам",
      "домашние задания, ожидающие проверки",
      "учебные планы и прогресс учеников",
      "сообщения и уведомления школы",
    ],
    footer: "Рабочий кабинет музыкальной школы Maestro",
  },
};

export function AuthHeroPanel({ profile = "student" }: { profile?: AuthProfile }) {
  const selected = content[profile];
  return (
    <section className="brand-dark relative hidden min-h-screen overflow-hidden bg-charcoal p-10 text-white lg:flex lg:flex-col xl:p-14">
      <img src="/brand/guitar.webp" alt="" width={1024} height={1024} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.35]" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-charcoal/60 via-charcoal/75 to-charcoal" />

      <div className="relative">
        <Brand />
      </div>

      <div className="relative my-auto max-w-xl py-16">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold-bright">Музыка начинается с тебя</p>
        <h2 className="font-display mt-5 text-balance text-[2.75rem] leading-[1.15] xl:text-5xl">
          {selected.heading}
        </h2>
        <p className="mt-6 max-w-lg text-base leading-7 text-white/80">
          {selected.description}
        </p>

        <div className="mt-8 space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">Ваше обучение</p>
          <ul className="space-y-2.5">
            {selected.highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-6 text-white/75">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold-ink">
                  <Check size={12} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

      </div>

      <div className="relative space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-bright">Maestro · Music school</p>
        <p className="text-sm text-white/70">{selected.footer}</p>
      </div>
    </section>
  );
}
