"use client";

import { Copy, ExternalLink, File, Image, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { ConfirmDialog } from "@/components/admin-feedback";
import { primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { cmsApi } from "@/lib/cms-api";
import { uploadMediaFile } from "@/lib/file-upload";
import type { CmsMaterialUsage } from "@/types/cms";

const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
const usageText = (usages: CmsMaterialUsage[]) => usages.length
  ? `Используется: ${usages.map((usage) => `${usage.lesson.module.course.title} → ${usage.lesson.title}`).join("; ")}. Удаление сломает эти ссылки.`
  : "Файл не используется в уроках.";

export default function MediaAdminPage() {
  const [uploading, setUploading] = useState(false);
  const confirm = useConfirmDialog();
  const resource = useApiResource(() => cmsApi.media(), []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { await uploadMediaFile(file); event.target.value = ""; await resource.reload(); }
    finally { setUploading(false); }
  }
  async function prepareDelete(folder: string, filename: string) {
    const usages = await cmsApi.mediaUsages(folder, filename);
    confirm.open({ title: "Удалить файл?", description: usageText(usages), action: async () => { await cmsApi.deleteMedia(folder, filename); await resource.reload(); } });
  }
  return <><PageHeader eyebrow="Media Library" title="Медиатека" description="Единое локальное хранилище изображений, PDF и файлов до 20 МБ." action={<label className={primaryButton}><Upload size={16} />{uploading ? "Загрузка..." : "Загрузить файл"}<input disabled={uploading} type="file" onChange={upload} className="hidden" /></label>} />
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.length ? <EmptyState title="Медиатека пуста" description="Загрузите изображение, PDF или другой файл." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{resource.data.map((item) => <div key={`${item.folder}/${item.filename}`} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-gold">{item.folder === "images" ? <Image size={19} /> : <File size={19} />}</span><p className="mt-5 truncate text-sm font-bold">{item.originalFilename}</p><p className="mt-1 truncate text-xs text-stone-400">{item.folder} · {formatSize(item.size)} · {new Intl.DateTimeFormat("ru-RU").format(new Date(item.createdAt))}</p><div className="mt-5 flex flex-wrap gap-2"><a href={item.url} target="_blank" rel="noreferrer" className={secondaryButton}><ExternalLink size={14} /> Открыть</a><button onClick={() => void navigator.clipboard.writeText(item.url)} className={secondaryButton}><Copy size={14} /> Ссылка</button><button onClick={() => void prepareDelete(item.folder, item.filename)} className={secondaryButton}><Trash2 size={14} /></button></div></div>)}</div>}
    <ConfirmDialog request={confirm.request} busy={confirm.busy} onClose={confirm.close} />
  </>;
}
