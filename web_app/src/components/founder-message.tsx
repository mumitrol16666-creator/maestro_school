"use client";

import Image from "next/image";
import { useState } from "react";

/** Drop a portrait at `public/images/founder.jpg` to replace the initials fallback. */
const FOUNDER_IMAGE = "/images/founder.jpg";

function FounderAvatar() {
  const [useFallback, setUseFallback] = useState(false);

  if (!useFallback) {
    return (
      <Image
        src={FOUNDER_IMAGE}
        alt="Владислав Сидоров"
        width={80}
        height={80}
        className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-gold/35 ring-offset-2 ring-offset-paper"
        onError={() => setUseFallback(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-ink font-display text-xl text-gold ring-2 ring-gold/35 ring-offset-2 ring-offset-paper"
    >
      ВС
    </span>
  );
}

export function FounderMessage({ className = "" }: { className?: string }) {
  return (
    <section className={`rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">О школе Maestro</p>
      <h2 className="font-display mt-3 text-3xl sm:text-4xl">Сообщение от основателя</h2>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <FounderAvatar />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-7 text-stone-600 sm:text-base">
            Платформа создана музыкальной школой Maestro, чтобы ученик видел свой путь, задания и прогресс не
            только на уроке, но и между занятиями.
          </p>
          <div className="mt-5 border-t border-stone-200/80 pt-5">
            <p className="font-display text-xl text-ink">Владислав Сидоров</p>
            <p className="mt-1 text-sm text-stone-500">Основатель музыкальной школы Maestro</p>
          </div>
        </div>
      </div>
    </section>
  );
}
