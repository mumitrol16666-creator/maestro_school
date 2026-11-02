"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

/**
 * Plan 5.5: a card to share in the family chat when a topic or a sector is closed — the child's
 * name, what was achieved, the date and the school. Drawn on a canvas in the browser; shared
 * with the system share sheet when the phone has one, otherwise saved as a picture.
 */
type ShareKind = "topic" | "sector";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Aqtobe" });

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  return lines;
}

export function drawAchievementCard(input: { kind: ShareKind; name: string; title: string; date: Date; sequence?: number | null }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, "#1c1b18");
  gradient.addColorStop(1, "#3a2f12");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = "#d4aa55";
  context.font = "bold 40px system-ui, sans-serif";
  context.fillText("MAESTRO · MUSIC SCHOOL", 80, 120);
  context.fillStyle = "rgba(255,255,255,0.7)";
  context.font = "36px system-ui, sans-serif";
  context.fillText(input.kind === "topic" ? "Тема освоена" : `Сектор${input.sequence ? ` ${input.sequence}` : ""} закрыт`, 80, 260);
  context.fillStyle = "#ffffff";
  context.font = "bold 92px Georgia, serif";
  const lines = wrapLines(context, input.title, 920, 3);
  lines.forEach((line, index) => context.fillText(line, 80, 400 + index * 110));
  context.fillStyle = "#d4aa55";
  context.font = "bold 48px system-ui, sans-serif";
  context.fillText(input.name, 80, 860);
  context.fillStyle = "rgba(255,255,255,0.6)";
  context.font = "36px system-ui, sans-serif";
  context.fillText(dateLabel.format(input.date), 80, 930);
  return canvas;
}

export function ShareAchievementButton({ kind, title, date, sequence = null, compact = false }: {
  kind: ShareKind;
  title: string;
  date: string;
  sequence?: number | null;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function share() {
    setState("busy");
    try {
      const canvas = drawAchievementCard({ kind, title, date: new Date(date), sequence, name: user?.firstName || "Ученик" });
      if (!canvas) throw new Error("no canvas");
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no image");
      const file = new File([blob], "maestro-achievement.png", { type: "image/png" });
      const text = kind === "topic" ? `Тема «${title}» освоена — Maestro` : `Сектор${sequence ? ` ${sequence}` : ""} закрыт — Maestro`;
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: "Maestro", text });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "maestro-achievement.png";
        link.click();
        URL.revokeObjectURL(url);
      }
      setState("done");
    } catch (error) {
      setState((error as { name?: string })?.name === "AbortError" ? "idle" : "error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={state === "busy"}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white text-xs font-bold text-amber-900 transition hover:bg-amber-50 disabled:opacity-60 min-h-11 ${compact ? "px-2.5" : "px-3"}`}
      data-testid={`share-${kind}`}
      aria-label={`Поделиться: ${title}`}
    >
      <Share2 size={14} />
      {state === "done" ? "Готово" : state === "error" ? "Не вышло" : "Поделиться"}
    </button>
  );
}
