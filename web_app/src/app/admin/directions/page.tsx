"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { inputClass, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import type { CmsDirection } from "@/types/cms";

const empty = { title: "", slug: "", description: "", imageUrl: "" };

export default function DirectionsAdminPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CmsDirection | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const resource = useApiResource(() => cmsApi.directions(search, page), [search, page]);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    const body = { ...form, description: form.description || null, imageUrl: form.imageUrl || null };
    if (editing) await cmsApi.updateDirection(editing.id, body); else await cmsApi.createDirection(body);
    setEditing(null); setForm(empty); setSaving(false); await resource.reload();
  }
  function edit(item: CmsDirection) { setEditing(item); setForm({ title: item.title, slug: item.slug, description: item.description ?? "", imageUrl: item.imageUrl ?? "" }); }

  return <><PageHeader eyebrow="Каталог" title="Направления" description="Создавайте направления школы и управляйте их публикацией." />
    <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
      <section>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"><Search size={16} className="text-stone-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Поиск по названию или slug" className="min-w-0 flex-1 text-sm outline-none" /></div>
        {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.data.length ? <EmptyState title="Направлений пока нет" description="Создайте первое направление справа." /> :
          <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft"><div className="divide-y divide-stone-100">{resource.data.data.map((item) => <div key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{item.title}</h2><PublishBadge published={item.isPublished} archived={!!item.deletedAt} /></div><p className="mt-1 text-xs font-bold text-stone-400">/{item.slug}</p><p className="mt-2 line-clamp-1 text-sm text-stone-500">{item.description || "Без описания"}</p></div><div className="flex gap-2"><button onClick={() => edit(item)} className={secondaryButton}><Pencil size={15} /></button><button onClick={async () => { await cmsApi.publishDirection(item.id, !item.isPublished); await resource.reload(); }} className={secondaryButton}>{item.isPublished ? "Снять" : "Опубликовать"}</button><button onClick={async () => { await cmsApi.deleteDirection(item.id); await resource.reload(); }} className={secondaryButton}><Trash2 size={15} /></button></div></div>)}</div></div>}
        {resource.data?.meta && resource.data.meta.pages > 1 && <div className="mt-5 flex justify-between"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>Назад</button><span className="text-sm text-stone-500">{page} / {resource.data.meta.pages}</span><button disabled={page >= resource.data.meta.pages} onClick={() => setPage(page + 1)} className={secondaryButton}>Далее</button></div>}
      </section>
      <form onSubmit={save} className="h-fit rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editing ? "Редактирование" : "Новое направление"}</p><div className="mt-5 space-y-4"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Название" className={inputClass} /><input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug" className={inputClass} /><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Описание" className={`${inputClass} min-h-28`} /><input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="Ссылка на изображение" className={inputClass} /><button disabled={saving} className={`${primaryButton} w-full`}><Plus size={16} />{editing ? "Сохранить" : "Создать направление"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className={`${secondaryButton} w-full`}>Отмена</button>}</div></form>
    </div></>;
}
