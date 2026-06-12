import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthPlatformPreview } from "@/components/auth-platform-preview";

const highlights = [
  "курсы и материалы по шагам",
  "домашние задания с проверкой",
  "онлайн-уроки с преподавателем",
  "баллы, достижения и Maestro Coins",
] as const;

export function AuthHeroPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
      <div className="noise absolute inset-0 opacity-20" />
      <div className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full border border-gold/20" />
      <div className="absolute -bottom-24 -right-16 h-[360px] w-[360px] rounded-full border border-gold/30" />

      <div className="relative">
        <Brand />
      </div>

      <div className="relative my-auto max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Maestro Education Platform</p>
        <h1 className="font-display mt-5 text-5xl leading-[1.08] xl:text-6xl">
          Твой музыкальный прогресс — в одном кабинете
        </h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-white/60">
          Уроки, домашние задания, проверка преподавателя, онлайн-занятия и достижения Maestro собраны в одной
          системе.
        </p>

        <div className="mt-8 space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Что внутри</p>
          <ul className="space-y-2.5">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-6 text-white/75">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                  <Check size={12} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <AuthPlatformPreview />
      </div>

      <div className="relative space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">Maestro Education Platform</p>
        <p className="text-sm text-white/45">Личный кабинет ученика музыкальной школы Maestro</p>
      </div>
    </section>
  );
}
