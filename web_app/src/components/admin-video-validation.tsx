"use client";

import { CheckCircle2, ExternalLink, Pencil, Trash2, XCircle } from "lucide-react";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import { secondaryButton } from "@/components/admin-ui";
import { parseVideoUrl } from "@/lib/parse-video-url";

const providerLabels = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  cloudflare: "Cloudflare Stream",
  unknown: "Неизвестно",
};

export function AdminVideoValidation({ videoUrl, title, onReplace, onDelete }: { videoUrl: string; title: string; onReplace: () => void; onDelete: () => void }) {
  if (!videoUrl.trim()) return null;
  const parsed = parseVideoUrl(videoUrl);

  return <div className={`rounded-[24px] border p-4 ${parsed ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/50"}`}>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${parsed ? "text-emerald-600" : "text-red-600"}`}>{parsed ? <CheckCircle2 size={20} /> : <XCircle size={20} />}</span>
        <div><p className="text-sm font-bold">{parsed ? "Ссылка распознана" : "Ссылка не поддерживается"}</p><p className="mt-1 break-all text-xs text-stone-500">{parsed ? `${providerLabels[parsed.provider]} · videoId: ${parsed.videoId}` : "Поддерживаются YouTube, Vimeo и Cloudflare Stream."}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {parsed && <a href={videoUrl} target="_blank" rel="noreferrer" className={secondaryButton}><ExternalLink size={14} /> Открыть</a>}
        <button type="button" onClick={onReplace} className={secondaryButton}><Pencil size={14} /> Заменить</button>
        <button type="button" onClick={onDelete} className={secondaryButton}><Trash2 size={14} /> Удалить</button>
      </div>
    </div>
    <LessonVideoPlayer videoUrl={videoUrl} title={title || "Предпросмотр видео"} />
  </div>;
}
