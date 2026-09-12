"use client";
import { Download } from "lucide-react";
import { parseVideoUrl } from "@/lib/parse-video-url";
import { isManagedMediaUrl, triggerFileDownload } from "@/lib/file-download";
import type { SchoolOfflineLesson } from "@/types/school-offline";

function MaterialPreview({
  material,
}: {
  material: SchoolOfflineLesson["materials"][number];
}) {
  if (!material.url) return null;
  const parsed = parseVideoUrl(material.url);
  const directVideo =
    material.type === "video" ||
    material.mimeType?.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(material.url);
  if (directVideo) {
    return (
      <video
        controls
        preload="metadata"
        className="mb-3 max-h-72 w-full rounded-xl bg-black"
        onClick={(event) => event.stopPropagation()}
        src={material.url}
      />
    );
  }
  if (parsed) {
    return (
      <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          title={material.title || "Видео к уроку"}
          src={parsed.embedUrl}
          className="h-full w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    );
  }
  if (material.type === "image" || material.mimeType?.startsWith("image/")) {
    return (
      <img
        src={material.url}
        alt={material.title || "Материал урока"}
        className="mb-3 max-h-72 w-full rounded-xl object-contain"
        loading="lazy"
        onClick={(event) => event.stopPropagation()}
      />
    );
  }
  if (
    material.type === "pdf" ||
    material.mimeType === "application/pdf" ||
    /\.pdf(\?|$)/i.test(material.url)
  ) {
    return (
      <iframe
        title={material.title || "PDF к уроку"}
        src={material.url}
        className="mb-3 h-40 w-full rounded-xl border border-stone-200 bg-white sm:h-80"
        onClick={(event) => event.stopPropagation()}
      />
    );
  }
  return null;
}

export function LessonMaterialItems({
  materials,
}: {
  materials: SchoolOfflineLesson["materials"];
}) {
  return (
    <div className="mt-3 space-y-2.5">
      {materials.map((material, index) => {
        if (!material.url) return null;
        const isFile =
          isManagedMediaUrl(material.url) ||
          ["file", "pdf", "image", "audio"].includes(material.type ?? "") ||
          Boolean(material.mimeType && !material.mimeType.startsWith("video/"));
        const title = material.title || `Материал ${index + 1}`;

        return (
          <div
            key={`${material.url}-${index}`}
            className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <MaterialPreview material={material} />
              <p className="truncate text-sm font-bold text-ink">{title}</p>
              {material.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-stone-500">
                  {material.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (isFile) {
                  void triggerFileDownload(material.url, title);
                  return;
                }
                window.open(material.url, "_blank", "noopener,noreferrer");
              }}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-ink shadow-xs transition hover:border-amber-300 hover:bg-amber-50"
            >
              <Download size={14} className="text-gold" />
              <span>{isFile ? "Скачать файл" : "Открыть материал"}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
