"use client";

import { Clock3, Database, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { ConfirmDialog, SaveStatus, type SaveState } from "@/components/admin-feedback";
import { inputClass, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { cmsApi } from "@/lib/cms-api";
import type { CmsDirection } from "@/types/cms";

const empty = { title: "", slug: "", description: "", imageUrl: "" };

export default function DirectionsAdminPage() {
  const { user } = useAuth();
  return user?.productFeatures?.curatorWorkspaceV2
    ? <CrmDirectionsReadOnlyPage />
    : <LegacyDirectionsAdminPage />;
}

function CrmDirectionsReadOnlyPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const resource = useApiResource(() => cmsApi.directions(search, page), [search, page]);

  return <>
    <PageHeader
      eyebrow="Учебный контроль"
      title="Направления"
      description="Направления обучения, доступные в Maestro."
    />
    <div className="mb-5 flex items-center gap-3 border-y border-stone-200 py-4 text-sm text-stone-600">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink text-gold"><Database size={18} /></span>
      <div className="min-w-0">
        <p className="font-bold text-ink">Где изменить направления</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">Название и доступность настраиваются в CRM. Здесь можно проверить, что уже появилось в Maestro.</p>
      </div>
    </div>
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
      <Search size={16} className="text-stone-400" />
      <input
        value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        placeholder="Поиск по названию"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
    {resource.loading && !resource.data ? <LoadingState label="Загружаем направления" /> : null}
    {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}
    {resource.data && !resource.data.data.length ? (
      <EmptyState title="Направления не найдены" description="Проверьте список направлений в CRM и обновите страницу." />
    ) : null}
    {resource.data?.data.length ? (
      <div className="divide-y divide-stone-200 border-y border-stone-200" data-testid="crm-direction-projection">
        {resource.data.data.map((item) => {
          const active = item.crmIsActive !== false && !item.deletedAt;
          return (
            <div key={item.id} className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4 sm:px-3">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-ink sm:text-base">{item.title}</h2>
                  <span className={`rounded-md px-2 py-1 text-[10px] font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                    {active ? "Активно" : "В архиве"}
                  </span>
                  {!item.crmDirectionId ? (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">Ожидает сверки</span>
                  ) : null}
                </div>
                {item.description ? <p className="mt-1 truncate text-xs text-stone-500">{item.description}</p> : null}
              </div>
              <div className="shrink-0 text-right text-[11px] text-stone-400">
                <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {formatDirectionSync(item.crmSyncedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    ) : null}
    {resource.data?.meta && resource.data.meta.pages > 1 ? (
      <div className="mt-5 flex items-center justify-between gap-3">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>Назад</button>
        <span className="text-sm text-stone-500">{page} / {resource.data.meta.pages}</span>
        <button disabled={page >= resource.data.meta.pages} onClick={() => setPage(page + 1)} className={secondaryButton}>Далее</button>
      </div>
    ) : null}
  </>;
}

function formatDirectionSync(value?: string | null) {
  if (!value) return "Ещё не обновлено";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function LegacyDirectionsAdminPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CmsDirection | null>(null);
  const [form, setForm] = useState(empty);
  const [baseline, setBaseline] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const confirm = useConfirmDialog();
  const resource = useApiResource(() => cmsApi.directions(search, page), [search, page]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const saveState: SaveState = saving ? "saving" : dirty ? "dirty" : saved ? "saved" : "idle";
  useUnsavedChanges(dirty);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const body = { ...form, description: form.description || null, imageUrl: form.imageUrl || null };
      if (editing) await cmsApi.updateDirection(editing.id, body); else await cmsApi.createDirection(body);
      setEditing(null); setForm(empty); setBaseline(empty); setSaved(true); await resource.reload();
    } finally {
      setSaving(false);
    }
  }
  function edit(item: CmsDirection) {
    if (dirty && !window.confirm("Есть несохранённые изменения. Продолжить и потерять их?")) return;
    const value = { title: item.title, slug: item.slug, description: item.description ?? "", imageUrl: item.imageUrl ?? "" };
    setEditing(item); setForm(value); setBaseline(value); setSaved(false);
  }

  return <><PageHeader eyebrow="Каталог" title="Направления" description="Создавайте направления школы и управляйте их публикацией." />
    <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
      <section>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"><Search size={16} className="text-stone-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Поиск по названию или адресу" className="min-w-0 flex-1 text-sm outline-none" /></div>
        {resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : !resource.data?.data.length ? <EmptyState title="Направлений пока нет" description="Создайте первое направление справа." /> :
          <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft"><div className="divide-y divide-stone-100">{resource.data.data.map((item) => <div key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{item.title}</h2><PublishBadge published={item.isPublished} archived={!!item.deletedAt} /></div><p className="mt-1 text-xs font-bold text-stone-400">Адрес: /{item.slug}</p><p className="mt-2 line-clamp-1 text-sm text-stone-500">{item.description || "Без описания"}</p></div><div className="flex gap-2"><button onClick={() => edit(item)} className={secondaryButton}><Pencil size={15} /></button><button onClick={async () => { await cmsApi.publishDirection(item.id, !item.isPublished); await resource.reload(); }} className={secondaryButton}>{item.isPublished ? "Снять" : "Опубликовать"}</button><button onClick={() => confirm.open({ title: "Удалить направление?", description: `Направление «${item.title}» будет отправлено в архив.`, action: async () => { await cmsApi.deleteDirection(item.id); await resource.reload(); } })} className={secondaryButton}><Trash2 size={15} /></button></div></div>)}</div></div>}
        {resource.data?.meta && resource.data.meta.pages > 1 && <div className="mt-5 flex justify-between"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className={secondaryButton}>Назад</button><span className="text-sm text-stone-500">{page} / {resource.data.meta.pages}</span><button disabled={page >= resource.data.meta.pages} onClick={() => setPage(page + 1)} className={secondaryButton}>Далее</button></div>}
      </section>
      <form onSubmit={save} className="h-fit rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editing ? "Редактирование" : "Новое направление"}</p><SaveStatus state={saveState} /></div><div className="mt-5 space-y-4"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Название" className={inputClass} /><input required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Адрес раздела латиницей" className={inputClass} /><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Описание" className={`${inputClass} min-h-28`} /><input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="Ссылка на изображение" className={inputClass} /><button disabled={saving} className={`${primaryButton} w-full`}><Plus size={16} />{editing ? "Сохранить" : "Создать направление"}</button>{editing && <button type="button" onClick={() => { if (!dirty || window.confirm("Отменить несохранённые изменения?")) { setEditing(null); setForm(empty); setBaseline(empty); } }} className={`${secondaryButton} w-full`}>Отмена</button>}</div></form>
    </div><ConfirmDialog request={confirm.request} busy={confirm.busy} onClose={confirm.close} /></>;
}
