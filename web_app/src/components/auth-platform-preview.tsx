import { BookOpen, Coins, Laptop, ListChecks } from "lucide-react";

type PreviewCard = {
  icon: typeof BookOpen;
  label: string;
  value: string;
  className: string;
  badge?: string;
  accent?: boolean;
};

const cards: PreviewCard[] = [
  {
    icon: BookOpen,
    label: "Урок 2",
    value: "Первые аккорды",
    className: "lg:translate-x-0",
  },
  {
    icon: ListChecks,
    label: "Домашнее задание",
    value: "На проверке",
    badge: "Проверка",
    className: "lg:translate-x-6",
  },
  {
    icon: Coins,
    label: "Баллы",
    value: "180 · 12 Coins",
    accent: true,
    className: "lg:-translate-x-2",
  },
  {
    icon: Laptop,
    label: "Онлайн-урок",
    value: "Назначен",
    badge: "Zoom",
    className: "lg:translate-x-4",
  },
];

export function AuthPlatformPreview() {
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition ${card.className} ${
              card.accent ? "border-gold/30 bg-gold/[0.08]" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-gold">
                <Icon size={16} />
              </span>
              {card.badge ? (
                <span className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">
                  {card.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{card.label}</p>
            <p className={`mt-1 text-sm font-semibold leading-snug ${card.accent ? "text-gold" : "text-white/90"}`}>
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
