"use client";

import { Guitar } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

/**
 * В-23: one «Победа» window for a passed test, a mastered topic or a closed sector, and a streak of
 * 7 or 30 days. A big number counts up from 0 in 0.8 s, brand-colour confetti falls for 1.5 s, one
 * sentence in «ты», «Дальше». The backdrop never takes a tap — only the card does — so a stray touch
 * or a script clicking behind it still reaches the screen. It closes by itself after 6 s, on Escape
 * and on «Дальше». With «reduce motion» there is no confetti and the number is final at once.
 */
export const CELEBRATION_AUTO_CLOSE_MS = 6_000;
const COUNT_UP_MS = 800;
const CONFETTI_COLORS = ["#C59A44", "#F5C45C", "#0D0D0D", "#F5F2EA"] as const;
const CONFETTI_PIECES = 36;

export interface CelebrationProps {
  /** The final number; it counts up from 0. */
  value: number;
  /** Written before the number («+») and after it in a smaller size («%», «баллов»). */
  prefix?: string;
  unit?: string;
  title: string;
  /** One sentence to the student, in «ты». */
  message: string;
  /** An optional small line under the sentence («+20 XP в недельную лигу»). */
  detail?: string | null;
  onClose: () => void;
  testId?: string;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The same pieces on every render: a fixed spread, no random numbers. */
const confetti = Array.from({ length: CONFETTI_PIECES }, (_, index) => {
  const unit = (index * 0.61803398875) % 1;
  return {
    left: `${Math.round(((index * 29) % 100) + (unit * 4))}%`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    delay: `${Math.round(unit * 380)}ms`,
    drift: `${Math.round((unit - 0.5) * 160)}px`,
    turn: `${Math.round(240 + unit * 480)}deg`,
    wide: index % 3 === 0,
  };
});

export function Celebration({ value, prefix = "", unit, title, message, detail = null, onClose, testId = "celebration" }: CelebrationProps) {
  const [reduced] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(reduced ? value : 0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Focus goes to «Дальше» and comes back to where it was.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), CELEBRATION_AUTO_CLOSE_MS);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    let frame = 0;
    const started = performance.now();
    function step(now: number) {
      const progress = Math.min(1, (now - started) / COUNT_UP_MS);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-charcoal/45 p-4 print:hidden"
      data-testid={`${testId}-layer`}
    >
      {reduced ? null : (
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="celebration-confetti">
          {confetti.map((piece, index) => (
            <span
              key={index}
              className="maestro-confetti"
              style={{
                left: piece.left,
                width: piece.wide ? 12 : 8,
                height: piece.wide ? 6 : 10,
                backgroundColor: piece.color,
                animationDelay: piece.delay,
                "--confetti-drift": piece.drift,
                "--confetti-turn": piece.turn,
              } as CSSProperties}
            />
          ))}
        </div>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        data-testid={testId}
        className={`pointer-events-auto relative w-full max-w-sm rounded-[28px] border border-gold/50 bg-cream px-6 pb-6 pt-7 text-center shadow-2xl ${reduced ? "" : "maestro-celebration-card"}`}
      >
        <p className="whitespace-nowrap font-display text-6xl font-black leading-none tabular-nums text-ink" data-testid="celebration-number">
          <span className="text-gold-ink">{prefix}</span>
          {shown}
          {unit ? <span className="font-sans text-2xl font-bold text-stone-600">{` ${unit}`}</span> : null}
        </p>
        <h2 id={titleId} className="mt-4 font-display text-3xl leading-tight text-ink">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-base leading-6 text-stone-700">
          {message}
        </p>
        {detail ? (
          <p className="mt-2 text-sm font-bold text-gold-ink" data-testid="celebration-detail">
            {detail}
          </p>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-base font-bold text-white transition hover:bg-gold hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          <Guitar size={18} aria-hidden="true" /> Дальше
        </button>
      </div>
    </div>
  );
}
