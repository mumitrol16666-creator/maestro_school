"use client";

import { Home, RotateCcw } from "lucide-react";
import Link from "next/link";

/**
 * В-17: the one error look of the student app — the logo, a Russian title, one line of
 * reason and two ways out. Used by the section error, the global error, «нет такой
 * страницы» and a screen whose data did not load.
 */
export function AppErrorScreen({
  title,
  reason,
  onRetry,
  homeHref = "/dashboard",
  fullPage = false,
}: {
  title: string;
  reason: string;
  onRetry: () => void;
  homeHref?: string;
  /** Outside the shell (global error, a 404 without a session) the screen fills the window. */
  fullPage?: boolean;
}) {
  return (
    <section
      data-testid="app-error-screen"
      className={`grid place-items-center px-2 py-10 text-center ${fullPage ? "min-h-dvh bg-cream" : "min-h-[60vh]"}`}
    >
      <div className="w-full max-w-sm">
        <img
          src="/brand/guitar-avatar.png"
          width={72}
          height={72}
          alt="Maestro"
          className="mx-auto h-[72px] w-[72px] rounded-2xl"
        />
        <h1 className="font-display mt-6 text-[28px] leading-tight text-ink">{title}</h1>
        <p className="mt-3 text-base leading-6 text-stone-600">{reason}</p>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onRetry} className="brand-button-primary">
            <RotateCcw size={17} aria-hidden="true" /> Повторить
          </button>
          {fullPage ? (
            // Outside the app's layout the client router may be the broken part: load the page anew.
            <a href={homeHref} className="brand-button-secondary">
              <Home size={17} aria-hidden="true" /> На главную
            </a>
          ) : (
            <Link href={homeHref} className="brand-button-secondary">
              <Home size={17} aria-hidden="true" /> На главную
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** The student-facing reason for a failed request; English server texts never reach the child. */
export function errorScreenCopy(message: string | null | undefined, code?: string | null) {
  if (code === "NETWORK_ERROR" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { title: "Нет связи", reason: "Проверь интернет и нажми «Повторить»." };
  }
  if (code === "NOT_FOUND") {
    return { title: "Такой страницы нет", reason: "Возможно, её убрали или ссылка устарела." };
  }
  if (code === "FORBIDDEN") {
    return { title: "Раздел закрыт", reason: "Этот раздел тебе пока недоступен." };
  }
  if (code === "CRM_UNAVAILABLE" || code === "CRM_TIMEOUT") {
    return { title: "Нет связи со школой", reason: "Расписание школы сейчас не отвечает. Попробуй через минуту." };
  }
  const russian = message && /[а-яё]/i.test(message) ? message : null;
  return { title: "Что-то пошло не так", reason: russian ?? "Экран не загрузился. Попробуй ещё раз." };
}

/** A student screen whose data did not load: the same look inside the shell. */
export function ScreenError({
  message,
  code,
  retry,
}: {
  message: string | null | undefined;
  code?: string | null;
  retry: () => unknown;
}) {
  const copy = errorScreenCopy(message, code);
  return <AppErrorScreen title={copy.title} reason={copy.reason} onRetry={() => void retry()} />;
}
