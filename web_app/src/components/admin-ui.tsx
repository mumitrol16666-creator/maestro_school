export const inputClass = "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-gold";
export const primaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50";
export const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold";

export function PublishBadge({ published, archived = false }: { published: boolean; archived?: boolean }) {
  if (archived) return <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">Архив</span>;
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${published ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{published ? "Опубликовано" : "Черновик"}</span>;
}

export function PageControls({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return <div className="mt-5 flex items-center justify-between"><button disabled={page <= 1} onClick={() => onChange(page - 1)} className={secondaryButton}>Назад</button><span className="text-sm text-stone-500">{page} / {pages}</span><button disabled={page >= pages} onClick={() => onChange(page + 1)} className={secondaryButton}>Далее</button></div>;
}
