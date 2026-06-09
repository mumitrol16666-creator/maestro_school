"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { inputClass, PageControls, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import type { CmsNews } from "@/types/cms";

const empty = { title: "", content: "" };

export default function NewsAdminPage() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [editing, setEditing] = useState<CmsNews | null>(null);
  const [form, setForm] = useState(empty); const [saving, setSaving] = useState(false);
  const resource = useApiResource(() => cmsApi.news(search, page), [search, page]);
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); if (editing) await cmsApi.updateNews(editing.id, form); else await cmsApi.createNews(form); setEditing(null); setForm(empty); setSaving(false); await resource.reload(); }
  function edit(item: CmsNews) { setEditing(item); setForm({ title: item.title, content: item.content }); }
  return <><PageHeader eyebrow="Доска Maestro" title="Новости и объявления" description="Создавайте публикации в легком Markdown-редакторе." /><div className="grid gap-6 xl:grid-cols-[1fr_440px]">
    <section><div className="mb-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"><Search size={16} className="text-stone-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск публикаций" className="min-w-0 flex-1 text-sm outline-none" /></div>{resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.data.length ? <EmptyState title="Публикаций пока нет" description="Создайте первую новость справа." /> : <div className="space-y-3">{resource.data.data.map((item) => <article key={item.id} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-display text-2xl">{item.title}</h2><PublishBadge published={item.isPublished} archived={!!item.deletedAt} /></div><p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-6 text-stone-500">{item.content}</p></div><div className="flex gap-2"><button onClick={() => edit(item)} className={secondaryButton}><Pencil size={15} /></button><button onClick={async () => { await cmsApi.publishNews(item.id, !item.isPublished); await resource.reload(); }} className={secondaryButton}>{item.isPublished ? "Снять" : "Опубликовать"}</button><button onClick={async () => { await cmsApi.deleteNews(item.id); await resource.reload(); }} className={secondaryButton}><Trash2 size={15} /></button></div></div></article>)}</div>} {resource.data?.meta && <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />}</section>
    <form onSubmit={save} className="h-fit rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editing ? "Редактирование" : "Новая публикация"}</p><div className="mt-5 space-y-4"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Заголовок" className={inputClass} /><MarkdownEditor value={form.content} onChange={(content) => setForm({ ...form, content })} /><button disabled={saving} className={`${primaryButton} w-full`}><Plus size={16} />{editing ? "Сохранить" : "Создать публикацию"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className={`${secondaryButton} w-full`}>Отмена</button>}</div></form>
  </div></>;
}
