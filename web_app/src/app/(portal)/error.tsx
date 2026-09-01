"use client";

import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[portal] screen render failed", error);
  }, [error]);

  return (
    <section className="grid min-h-[420px] place-items-center rounded-[28px] border border-stone-200 bg-white p-6 text-center shadow-soft sm:p-10">
      <div className="max-w-md">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-stone-100 text-stone-700">
          <RotateCcw size={24} aria-hidden="true" />
        </span>
        <h1 className="font-display mt-5 text-3xl text-ink">Продолжить обучение</h1>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white"
          >
            <RotateCcw size={16} aria-hidden="true" /> Повторить
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-sm font-bold text-stone-700"
          >
            <Home size={16} className="mr-2" aria-hidden="true" /> На главную
          </Link>
        </div>
      </div>
    </section>
  );
}
