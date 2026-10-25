"use client";

import { ArrowRight, BookOpenCheck, ClipboardCheck, GraduationCap, Lightbulb, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notificationsApi } from "@/lib/notifications-api";
import { invalidateStudentHome } from "@/lib/student-home";
import type { ApiStudentHome } from "@/types/api";

/**
 * Plan 5.2: what is new since the last visit — a new homework, a lesson result, an answer to a
 * proposal, a scheduled exam — as banners on the home and in «Обучение». Opening one marks the
 * notification read and follows its link; the bell keeps the archive.
 */
const look: Record<string, { icon: typeof BookOpenCheck; tone: string; action: string }> = {
  homework_assigned: { icon: BookOpenCheck, tone: "border-amber-200 bg-amber-50 text-amber-950", action: "Открыть задание" },
  offline_lesson_report_ready: { icon: ClipboardCheck, tone: "border-emerald-200 bg-emerald-50 text-emerald-950", action: "Смотреть итог" },
  sector_proposal_decided: { icon: Lightbulb, tone: "border-sky-200 bg-sky-50 text-sky-950", action: "Открыть сектор" },
  sector_exam_updated: { icon: GraduationCap, tone: "border-violet-200 bg-violet-50 text-violet-950", action: "Подробнее" },
};

function isSafeInternalUrl(url: string | null): url is string {
  return Boolean(url && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\"));
}

export function StudentBanners({ banners }: { banners: ApiStudentHome["banners"] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = banners.filter((item) => !hidden.has(item.id));
  if (!visible.length) return null;

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
    <section className="mb-5 space-y-2" aria-label="Что нового" data-testid="student-banners">
      {visible.map((item) => {
        const style = look[item.type] ?? look.sector_exam_updated;
        const Icon = style.icon;
        return (
          <div key={item.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${style.tone}`} data-testid="student-banner" data-type={item.type}>
            <Icon size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{item.title}</p>
              <p className="mt-0.5 text-xs leading-5 opacity-80">{item.body}</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/80 px-3 text-xs font-bold shadow-xs"
                onClick={() => {
                  const url = item.url;
                  void settle(item.id).then(() => {
                    if (isSafeInternalUrl(url)) router.push(url);
                  });
                }}
              >
                {style.action} <ArrowRight size={14} />
              </button>
            </div>
            <button type="button" aria-label={`Скрыть: ${item.title}`} onClick={() => void settle(item.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg opacity-60 hover:bg-white/60 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
