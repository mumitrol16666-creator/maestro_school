"use client";

import { AlertCircle, Play } from "lucide-react";
import { parseVideoUrl } from "@/lib/parse-video-url";

interface LessonVideoPlayerProps {
  videoUrl?: string | null;
  title: string;
  locked?: boolean;
}

export function LessonVideoPlayer({ videoUrl, title, locked = false }: LessonVideoPlayerProps) {
  const parsed = parseVideoUrl(videoUrl);

  if (locked) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-[30px] bg-[#2B2722] shadow-soft">
        <div className="noise absolute inset-0 opacity-20" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="grid h-20 w-20 place-items-center rounded-full border border-white/20 bg-white/10 opacity-40">
            <Play size={27} fill="currentColor" />
          </span>
          <p className="mt-5 text-sm font-bold">Урок закрыт</p>
          <p className="mt-1 text-xs text-white/45">Сначала завершите предыдущий урок</p>
        </div>
      </div>
    );
  }

  if (!videoUrl?.trim()) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-[30px] border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-soft">
        <Play size={28} className="text-stone-300" />
        <p className="mt-4 text-sm font-bold text-stone-600">Видео пока не добавлено</p>
        <p className="mt-1 text-xs text-stone-400">Преподаватель загрузит запись позже</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-[30px] border border-red-200 bg-red-50 p-8 text-center shadow-soft">
        <AlertCircle size={28} className="text-red-500" />
        <p className="mt-4 text-sm font-bold text-red-700">Не удалось распознать ссылку на видео</p>
        <p className="mt-2 max-w-md text-xs text-red-600">
          Поддерживаются YouTube, Vimeo и Cloudflare Stream. Проверьте ссылку в CMS.
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-[30px] bg-black shadow-soft">
      <iframe
        src={parsed.embedUrl}
        title={title}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-black/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80">
        {parsed.provider === "youtube" ? "YouTube" : parsed.provider === "vimeo" ? "Vimeo" : "Stream"}
      </span>
    </div>
  );
}
