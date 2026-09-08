"use client";

import { ArrowRight, BookOpen, Clock3, Lightbulb, Printer, Target } from "lucide-react";
import type { PreparedTheoryMaterial } from "@/types/prepared-tests";

interface PreparedTheoryMaterialProps {
  material: PreparedTheoryMaterial;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  disabledMessage?: string | null;
}

export function PreparedTheoryMaterialView({
  material,
  onContinue,
  continueDisabled = false,
  continueLabel = "Перейти к тесту",
  disabledMessage,
}: PreparedTheoryMaterialProps) {
  return (
    <article data-theory-print className="overflow-hidden rounded-[30px] border border-stone-200 bg-paper shadow-soft print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
      <header className="bg-ink px-5 py-7 text-white sm:px-8 sm:py-9 print:bg-white print:px-0 print:py-0 print:text-black">
        <div className="hidden print:block">
          <p className="text-xs font-black uppercase tracking-[0.18em]">Maestro Music School · Теория гитары</p>
          <div className="my-4 h-px bg-stone-300" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-gold print:text-stone-600">
          <span className="inline-flex items-center gap-2"><BookOpen size={16} /> Урок перед тестом</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 size={15} /> {material.readingMinutes} мин</span>
        </div>
        <h2 className="mt-4 max-w-3xl font-display text-3xl leading-tight sm:text-4xl">{material.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base print:text-stone-700">
          {material.introduction}
        </p>
      </header>

      <div className="space-y-8 px-5 py-7 sm:px-8 sm:py-9 print:px-0 print:py-6">
        {material.sections.map((section, index) => (
          <section key={section.title} className="break-inside-avoid">
            <div className="flex items-start gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-sm font-black text-gold print:border print:border-stone-300 print:bg-white print:text-black">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-2xl">{section.title}</h3>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-stone-700">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {section.points?.length ? (
                  <ul className="mt-4 grid gap-2 text-sm leading-6 text-stone-700">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-3 rounded-xl bg-stone-50 px-4 py-3 print:border print:border-stone-200 print:bg-white">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <section className="break-inside-avoid rounded-[24px] border border-amber-200 bg-amber-50 p-5 print:bg-white">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-amber-900">
              <Lightbulb size={18} /> Главное запомнить
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
              {material.remember.map((item) => <li key={item} className="flex gap-2"><span className="font-black text-gold">✓</span><span>{item}</span></li>)}
            </ul>
          </section>
          <section className="break-inside-avoid rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 print:bg-white">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-emerald-900">
              <Target size={18} /> Попробуйте на гитаре
            </h3>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
              {material.practice.map((item, index) => <li key={item} className="flex gap-2"><span className="font-black text-emerald-700">{index + 1}.</span><span>{item}</span></li>)}
            </ol>
          </section>
        </div>

        <div data-print-hide className="flex flex-col gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-sm font-bold hover:border-gold">
            <Printer size={17} /> Распечатать урок
          </button>
          <div className="sm:text-right">
            {disabledMessage ? <p className="mb-2 text-sm font-semibold text-amber-800">{disabledMessage}</p> : null}
            {onContinue ? (
              <button type="button" onClick={onContinue} disabled={continueDisabled} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-3.5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                {continueLabel} <ArrowRight size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
