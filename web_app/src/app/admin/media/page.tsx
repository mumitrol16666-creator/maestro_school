"use client";

import { Copy, File, Image, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";

function toBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MediaAdminPage() {
  const [uploading, setUploading] = useState(false);
  const resource = useApiResource(() => cmsApi.media(), []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); await cmsApi.uploadMedia({ filename: file.name, mimeType: file.type || "application/octet-stream", base64: await toBase64(file) }); setUploading(false); event.target.value = ""; await resource.reload();
  }
  return <><PageHeader eyebrow="Media Library" title="Медиатека" description="Единое локальное хранилище изображений, PDF и файлов до 20 МБ." action={<label className={primaryButton}><Upload size={16} />{uploading ? "Загрузка..." : "Загрузить файл"}<input disabled={uploading} type="file" onChange={upload} className="hidden" /></label>} />
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.length ? <EmptyState title="Медиатека пуста" description="Загрузите изображение, PDF или другой файл." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{resource.data.map((item) => <div key={`${item.folder}/${item.filename}`} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-gold">{item.folder === "images" ? <Image size={19} /> : <File size={19} />}</span><p className="mt-5 truncate text-sm font-bold">{item.filename}</p><p className="mt-1 text-xs text-stone-400">{item.folder} · {(item.size / 1024).toFixed(1)} KB</p><div className="mt-5 flex gap-2"><button onClick={() => navigator.clipboard.writeText(item.url)} className={secondaryButton}><Copy size={14} /> Ссылка</button><button onClick={async () => { await cmsApi.deleteMedia(item.folder, item.filename); await resource.reload(); }} className={secondaryButton}><Trash2 size={14} /></button></div></div>)}</div>}
  </>;
}
