"use client";

import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { inputClass, PageControls, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import type { CmsCourse } from "@/types/cms";

const empty = { directionId: "", title: "", description: "", thumbnail: "", difficultyLevel: "beginner" };

export default function CoursesAdminPage() {
  const [search, setSearch] = useState(""); const [directionId, setDirectionId] = useState(""); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CmsCourse | null>(null); const [form, setForm] = useState(empty); const [saving, setSaving] = useState(false);
  const directions = useApiResource(async () => (await cmsApi.directions("", 1, 100)).data.filter((item) => !item.deletedAt), []);
  const resource = useApiResource(() => cmsApi.courses(directionId, search, page), [directionId, search, page]);
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); const body = { ...form, description: form.description || null, thumbnail: form.thumbnail || null }; if (editing) await cmsApi.updateCourse(editing.id, body); else await cmsApi.createCourse(body); setEditing(null); setForm(empty); setSaving(false); await resource.reload(); }
  function edit(item: CmsCourse) { setEditing(item); setForm({ directionId: item.directionId, title: item.title, description: item.description ?? "", thumbnail: item.thumbnail ?? "", difficultyLevel: item.difficultyLevel }); }

  return <><PageHeader eyebrow="Каталог" title="Курсы" description="Создавайте курсы и переходите в конструктор модулей и уроков." /><div className="grid gap-6 xl:grid-cols-[1fr_390px]">
    <section><div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]"><div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"><Search size={16} className="text-stone-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск курса" className="min-w-0 flex-1 text-sm outline-none" /></div><select value={directionId} onChange={(e) => { setDirectionId(e.target.value); setPage(1); }} className={inputClass}><option value="">Все направления</option>{directions.data?.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div>
      {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.data.length ? <EmptyState title="Курсов пока нет" description="Создайте первый курс справа." /> : <div className="space-y-3">{resource.data.data.map((item) => <div key={item.id} className="card-hover rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{item.title}</h2><PublishBadge published={item.isPublished} archived={!!item.deletedAt} /></div><p className="mt-1 text-xs font-bold text-gold">{item.direction.title} · {item._count.modules} модулей</p><p className="mt-2 line-clamp-1 text-sm text-stone-500">{item.description}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/courses/${item.id}`} className={primaryButton}>Наполнить <ArrowRight size={15} /></Link><button onClick={() => edit(item)} className={secondaryButton}><Pencil size={15} /></button><button onClick={async () => { await cmsApi.publishCourse(item.id, !item.isPublished); await resource.reload(); }} className={secondaryButton}>{item.isPublished ? "Снять" : "Опубликовать"}</button><button onClick={async () => { await cmsApi.deleteCourse(item.id); await resource.reload(); }} className={secondaryButton}><Trash2 size={15} /></button></div></div></div>)}</div>}
      {resource.data?.meta && <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />}
    </section>
    <form onSubmit={save} className="h-fit rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editing ? "Редактирование" : "Новый курс"}</p><div className="mt-5 space-y-4"><select required value={form.directionId} onChange={(e) => setForm({ ...form, directionId: e.target.value })} className={inputClass}><option value="">Выберите направление</option>{directions.data?.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Название курса" className={inputClass} /><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Описание" className={`${inputClass} min-h-28`} /><input type="url" value={form.thumbnail} onChange={(e) => setForm({ ...form, thumbnail: e.target.value })} placeholder="Ссылка на обложку" className={inputClass} /><select value={form.difficultyLevel} onChange={(e) => setForm({ ...form, difficultyLevel: e.target.value })} className={inputClass}><option value="beginner">Начальный</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option><option value="all_levels">Для всех</option></select><button disabled={saving} className={`${primaryButton} w-full`}><Plus size={16} />{editing ? "Сохранить" : "Создать курс"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className={`${secondaryButton} w-full`}>Отмена</button>}</div></form>
  </div></>;
}
