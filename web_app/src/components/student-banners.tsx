"use client";

import { ArrowRight, BookOpenCheck, ChevronRight, ClipboardCheck, GraduationCap, Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notificationsApi } from "@/lib/notifications-api";
import { pluralize } from "@/lib/plural";
import { invalidateStudentHome } from "@/lib/student-home";
import type { ApiStudentHome } from "@/types/api";

type Banner = ApiStudentHome["banners"][number];

/**
 * Plan 5.2 / В-1: what is new since the last visit — a new homework, a lesson result, an answer to a
 * proposal, a scheduled exam — as compact banners on the home. One banner (the newest) is shown, the
 * rest sit behind «Ещё N»; opening one marks the notification read and follows its link; the bell keeps
 * the archive. «Обучение» does not repeat them, it only points to the home (`StudentBannersLink`).
 *
 * Two colours only: gold — something to do (a new homework); cream — news (a result, a sector, an exam).
 */
const tones = {
  action: { box: "border-gold/60 bg-[#FBEFCB] text-ink", button: "bg-gold text-ink hover:bg-[#d4aa55]" },
  news: { box: "border-stone-200 bg-[#FAF7EF] text-ink", button: "bg-white text-ink ring-1 ring-stone-200 hover:bg-stone-50" },
} as const;

const look: Record<string, { icon: typeof BookOpenCheck; tone: keyof typeof tones; action: string }> = {
  homework_assigned: { icon: BookOpenCheck, tone: "action", action: "Открыть задание" },
  offline_lesson_report_ready: { icon: ClipboardCheck, tone: "news", action: "Смотреть итог" },
  sector_proposal_decided: { icon: Lightbulb, tone: "news", action: "Открыть сектор" },
  sector_exam_updated: { icon: GraduationCap, tone: "news", action: "Подробнее" },
};
const fallbackLook = look.sector_exam_updated!;

const EVENTS = ["событие", "события", "событий"] as const;
const NEW_EVENTS = ["новое событие", "новых события", "новых событий"] as const;

function isSafeInternalUrl(url: string | null): url is string {
  return Boolean(url && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\"));
}

const XP_OR_COINS = /^\+\s?\d[\d\s]*\s?(?:XP|Coins)$/i;

/**
 * XP and Coins are not on the home (decisions of 24.10 and 02.11): «+20 XP» is cut from the banner
 * text, the bell keeps it. The text is «Урок (контекст). +100 баллов · +20 XP · «Тема» 0 → 100 %.
 * Посмотрите итог…» — sentences, and parts of a sentence joined by « · »; a part that is only XP or
 * Coins goes with its separator, a sentence left empty goes whole.
 */
function homeBody(body: string) {
  return body
    .split(/(?<=\.)\s+/)
    .map((sentence) => {
      const end = sentence.endsWith(".") ? "." : "";
      const parts = (end ? sentence.slice(0, -1) : sentence).split(" · ").filter((part) => !XP_OR_COINS.test(part.trim()));
      return parts.length ? `${parts.join(" · ")}${end}` : "";
    })
    .filter(Boolean)
    .join(" ");
}

function newestFirst(banners: Banner[]) {
  return [...banners].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || 0);
}

export function StudentBanners({ banners, total }: { banners: ApiStudentHome["banners"]; total?: number }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const visible = newestFirst(banners.filter((item) => !hidden.has(item.id)));
  if (!visible.length) return null;
  const shown = expanded ? visible : visible.slice(0, 1);
  // The home gets the newest five; «Ещё N» counts every unread one, the rest wait in the bell.
  const unread = Math.max(visible.length, (total ?? banners.length) - hidden.size);
  const rest = unread - shown.length;
  const inBellOnly = unread - visible.length;

  async function settle(id: string) {
    setHidden((current) => new Set(current).add(id));
    try {
      await notificationsApi.markRead(id);
    } catch {
      // the banner is already hidden for this visit; the bell still shows it
    }
    invalidateStudentHome();
    window.dispatchEvent(new Event("maestro:notifications-changed"));
  }

  return (
    <section className="mt-3 space-y-2" aria-label="Что нового" data-testid="student-banners">
      {shown.map((item) => {
        const style = look[item.type] ?? fallbackLook;
        const tone = tones[style.tone];
        const Icon = style.icon;
        return (
          <div key={item.id} className={`flex items-center gap-2 rounded-2xl border py-1.5 pl-3 pr-1 ${tone.box}`} data-testid="student-banner" data-type={item.type}>
            <Icon size={20} className="shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1" title={homeBody(item.body)}>
              <p className="truncate text-sm font-black leading-5">{item.title}</p>
              <p className="line-clamp-1 text-xs leading-5 opacity-80">{homeBody(item.body)}</p>
            </div>
            <button
              type="button"
              aria-label={`${style.action}: ${item.title}`}
              title={style.action}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.button}`}
              onClick={() => {
                const url = item.url;
                void settle(item.id).then(() => {
                  if (isSafeInternalUrl(url)) router.push(url);
                });
              }}
            >
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Скрыть: ${item.title}`} onClick={() => void settle(item.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl opacity-60 hover:bg-white/60 hover:opacity-100">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {expanded && inBellOnly > 0 ? (
        <p className="px-2 text-xs font-semibold text-stone-500" data-testid="student-banners-in-bell">
          И ещё {inBellOnly} — в уведомлениях
        </p>
      ) : null}
      {(!expanded && rest > 0) || (expanded && visible.length > 1) ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-bold text-stone-700 hover:bg-stone-100"
          data-testid="student-banners-more"
        >
          {expanded ? "Свернуть" : `Ещё ${rest} ${pluralize(rest, EVENTS)}`}
          <ChevronRight size={16} className={expanded ? "-rotate-90" : "rotate-90"} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

/** «Обучение» does not repeat the banners: one line saying how many are waiting on the home. */
export function StudentBannersLink({ banners, total }: { banners: ApiStudentHome["banners"]; total?: number }) {
  const count = Math.max(banners.length, total ?? 0);
  if (!count) return null;
  return (
    <Link
      href="/dashboard"
      className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-gold/60 bg-[#FBEFCB] px-4 text-sm font-bold text-ink"
      data-testid="student-banners-link"
    >
      <span className="min-w-0">{count} {pluralize(count, NEW_EVENTS)}</span>
      <span className="inline-flex shrink-0 items-center gap-1">Главная <ArrowRight size={16} aria-hidden="true" /></span>
    </Link>
  );
}
