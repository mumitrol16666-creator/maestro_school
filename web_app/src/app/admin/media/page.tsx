"use client";

import { Check, Copy, ExternalLink, File, Image, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, useDeferredValue, useState } from "react";
import { ConfirmDialog } from "@/components/admin-feedback";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { cmsApi } from "@/lib/cms-api";
import { uploadMediaFile } from "@/lib/file-upload";
import { formatMediaSize } from "@/lib/media-utils";
import type { CmsMaterialUsage, CmsMedia } from "@/types/cms";

type FolderFilter = "" | CmsMedia["folder"];

const folderTabs: Array<{ value: FolderFilter; label: string }> = [
  { value: "", label: "Все" },
  { value: "pdf", label: "PDF" },
  { value: "images", label: "Изображения" },
  { value: "files", label: "Файлы" },
];

const usageText = (usages: CmsMaterialUsage[]) => usages.length
  ? `Используется: ${usages.map((usage) => `${usage.lesson.module.course.title} → ${usage.lesson.title}`).join("; ")}. Удаление сломает эти ссылки.`
  : "Файл не используется в уроках.";

export default function MediaAdminPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadDescription, setUploadDescription] = useState("");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<FolderFilter>("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const confirm = useConfirmDialog();
  const resource = useApiResource(() => cmsApi.media(deferredQuery, folder), [deferredQuery, folder]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadMediaFile(file, { description: uploadDescription.trim() || undefined });
      event.target.value = "";
      setUploadDescription("");
      await resource.reload();
    } finally {
      setUploading(false);
    }
  }

  async function prepareDelete(itemFolder: string, filename: string) {
    const usages = await cmsApi.mediaUsages(itemFolder, filename);
    confirm.open({
      title: "Удалить файл?",
      description: usageText(usages),
      action: async () => {
        await cmsApi.deleteMedia(itemFolder, filename);
        await resource.reload();
      },
    });
  }

  function startRename(item: CmsMedia) {
    setEditingKey(`${item.folder}/${item.filename}`);
    setEditingTitle(item.title || item.originalFilename);
  }

  async function saveRename(item: CmsMedia) {
    const title = editingTitle.trim();
    if (!title) return;
    setRenaming(true);
    try {
      await cmsApi.renameMedia(item.folder, item.filename, title);
      setEditingKey(null);
      await resource.reload();
    } finally {
      setRenaming(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Media Library"
        title="Медиатека"
        description="Единое локальное хранилище изображений, видео, PDF и файлов до 20 МБ."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={uploadDescription}
              onChange={(event) => setUploadDescription(event.target.value)}
              className={`${inputClass} w-56 py-2 text-sm`}
              placeholder="Описание (необязательно)"
              aria-label="Описание медиа"
            />
            <label className={primaryButton}>
              <Upload size={16} />
              {uploading ? "Загрузка..." : "Загрузить файл"}
              <input
                disabled={uploading}
                type="file"
                accept="application/pdf,image/*,video/*"
                onChange={(event) => void upload(event)}
                className="hidden"
              />
            </label>
          </div>
        )}
      />

      <div className="mb-6 space-y-3 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${inputClass} pl-11`}
            placeholder="Поиск по названию или имени файла..."
          />
        </label>
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

      {resource.loading ? (
        <LoadingState />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.reload} />
      ) : !resource.data?.length ? (
        <EmptyState
          title={query || folder ? "Файлы не найдены" : "Медиатека пуста"}
          description={query || folder ? "Попробуйте другой запрос или снимите фильтр." : "Загрузите изображение, PDF или другой файл."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resource.data.map((item) => (
            <div key={`${item.folder}/${item.filename}`} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-gold">
                {item.folder === "images" ? <Image size={19} /> : <File size={19} />}
              </span>
              {editingKey === `${item.folder}/${item.filename}` ? (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); void saveRename(item); }
                      if (event.key === "Escape") setEditingKey(null);
                    }}
                    className={`${inputClass} min-w-0 py-2 text-sm`}
                    aria-label="Название медиа"
                  />
                  <button type="button" disabled={renaming} onClick={() => void saveRename(item)} className={secondaryButton} aria-label="Сохранить название">
                    <Check size={14} />
                  </button>
                  <button type="button" disabled={renaming} onClick={() => setEditingKey(null)} className={secondaryButton} aria-label="Отменить переименование">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</p>
                  <button type="button" onClick={() => startRename(item)} className={secondaryButton} aria-label="Переименовать медиа">
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              {item.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">{item.description}</p> : null}
              <p className="mt-1 truncate text-xs text-stone-500">Файл: {item.originalFilename}</p>
              <p className="mt-1 truncate text-xs text-stone-400">
                {item.folder} · {formatMediaSize(item.size)} · {new Intl.DateTimeFormat("ru-RU").format(new Date(item.createdAt))}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={item.url} target="_blank" rel="noreferrer" className={secondaryButton}>
                  <ExternalLink size={14} /> Открыть
                </a>
                <button onClick={() => void navigator.clipboard.writeText(item.url)} className={secondaryButton}>
                  <Copy size={14} /> Ссылка
                </button>
                <button onClick={() => void prepareDelete(item.folder, item.filename)} className={secondaryButton}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog request={confirm.request} busy={confirm.busy} onClose={confirm.close} />
    </>
  );
}
