"use client";

import { File, Image, Search, Upload, X } from "lucide-react";
import { ChangeEvent, useDeferredValue, useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import { uploadMediaFile } from "@/lib/file-upload";
import { formatMediaSize } from "@/lib/media-utils";
import type { CmsMedia } from "@/types/cms";

type FolderFilter = "" | CmsMedia["folder"];

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: CmsMedia) => void;
  title?: string;
  defaultFolder?: FolderFilter;
  readOnly?: boolean;
}

const folderTabs: Array<{ value: FolderFilter; label: string }> = [
  { value: "", label: "Все" },
  { value: "pdf", label: "PDF" },
  { value: "images", label: "Изображения" },
  { value: "files", label: "Видео и файлы" },
];

export function MediaPicker({ open, onClose, onSelect, title = "Медиатека", defaultFolder = "", readOnly = false }: MediaPickerProps) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>(defaultFolder);
  const [uploading, setUploading] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const resource = useApiResource(
    () => (open ? cmsApi.media(deferredQuery, folder) : Promise.resolve([])),
    [open, deferredQuery, folder],
  );

  if (!open) return null;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(file);
      await resource.reload();
      onSelect(uploaded);
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[28px] border border-stone-200 bg-paper shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Медиатека</p>
            <h2 className="font-display mt-1 text-3xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className={secondaryButton} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 border-b border-stone-100 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={`${inputClass} pl-11`}
                placeholder="Поиск по названию или имени файла..."
              />
            </label>
            {!readOnly && <label className={`${primaryButton} shrink-0 cursor-pointer`}>
              <Upload size={16} />
              {uploading ? "Загрузка..." : "Загрузить"}
              <input
                disabled={uploading}
                type="file"
                accept="application/pdf,image/*,video/*"
                onChange={(event) => void upload(event)}
                className="hidden"
              />
            </label>}
          </div>
          <div className="flex flex-wrap gap-2">
            {folderTabs.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                onClick={() => setFolder(tab.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${folder === tab.value ? "bg-ink text-white" : "bg-stone-100 text-stone-600"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {resource.loading ? (
            <LoadingState label="Загружаем файлы" />
          ) : resource.error ? (
            <ErrorState message={resource.error} retry={resource.reload} />
          ) : !resource.data?.length ? (
            <EmptyState
              title="Файлы не найдены"
              description={query ? "Попробуйте другой запрос или загрузите новый файл." : "Загрузите PDF или изображение."}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {resource.data.map((item) => (
                <button
                  key={`${item.folder}/${item.filename}`}
                  type="button"
                  onClick={() => { onSelect(item); onClose(); }}
                  className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-gold hover:shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-gold">
                      {item.folder === "images" ? <Image size={17} /> : <File size={17} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{item.title}</p>
                      {item.description ? <p className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</p> : null}
                      <p className="mt-1 truncate text-[11px] text-stone-400">Файл: {item.originalFilename}</p>
                      <p className="mt-1 text-xs text-stone-400">
                        {item.folder} · {formatMediaSize(item.size)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
