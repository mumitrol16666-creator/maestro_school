"use client";

import { ExternalLink, FileUp, Link2, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { MaterialBadge } from "@/components/material-library-picker";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { fileToBase64 } from "@/lib/file-upload";
import { inferFileMimeType } from "@/lib/media-utils";
import { materialKindLabel, materialsApi } from "@/lib/materials-api";
import { sameSiteMediaUrl } from "@/lib/media-url";
import { isOfflineCoordinatorRole } from "@/lib/role-labels";
import type { MaterialKind, MaterialLibraryItem } from "@/types/materials";

const control = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
const kinds: Array<MaterialKind | "all"> = ["all", "video", "image", "pdf", "audio", "file", "link"];

/** Plan 1.12: the school's shared library — teachers and school admins paste links with a caption or upload files. */
export default function MaterialsLibraryPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MaterialKind | "all">("all");
  const library = useApiResource(
    () => materialsApi.library({ search, kind: kind === "all" ? undefined : kind, limit: 200 }),
    [search, kind],
  );
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canEditAll = isOfflineCoordinatorRole(user?.role);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ tone: "ok", text: await action() });
      await library.reload();
    } catch (reason) {
      setMessage({ tone: "error", text: reason instanceof ApiError || reason instanceof Error ? reason.message : "Не удалось сохранить" });
    } finally {
      setBusy(null);
    }
  }

  const items = library.data ?? [];
  const counts = useMemo(() => items.length, [items]);

  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow="Материалы"
        title="Библиотека материалов"
        description="Общая библиотека школы: вставьте ссылку и подпишите её или загрузите файл. В уроке и в домашнем задании материал находится по подписи."
      />

      <section className="grid min-w-0 gap-3 rounded-2xl border border-stone-200 bg-white p-4" aria-label="Добавить материал">
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[2fr_2fr_auto]">
          <label className="min-w-0 text-[10px] font-black uppercase tracking-wider text-stone-500">
            Ссылка
            <input className="brand-input mt-1 w-full normal-case tracking-normal" type="url" placeholder="https://youtu.be/…" value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <label className="min-w-0 text-[10px] font-black uppercase tracking-wider text-stone-500">
            Подпись
            <input className="brand-input mt-1 w-full normal-case tracking-normal" placeholder="Бой восьмыми под метроном" value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className={`${control} w-full bg-ink text-white`}
              disabled={busy !== null || !url.trim() || !title.trim()}
              onClick={() => void run("link", async () => {
                const item = await materialsApi.addLink(url, title);
                setUrl("");
                setTitle("");
                return `Добавлено: ${item.title}`;
              })}
            >
              {busy === "link" ? <LoaderCircle size={14} className="animate-spin" /> : <Link2 size={14} />} Добавить ссылку
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${control} border border-stone-200 bg-white text-stone-700`} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            {busy === "file" ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />} Загрузить файл
          </button>
          <span className="text-[11px] text-stone-500">До 20 МБ. Подпись возьмётся из поля выше или из названия файла. Видео лучше добавлять ссылкой на YouTube.</span>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run("file", async () => {
                if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ");
                const item = await materialsApi.uploadFile({
                  filename: file.name, mimeType: inferFileMimeType(file),
                  contentBase64: await fileToBase64(file), title: title.trim() || undefined,
                });
                setTitle("");
                return `Загружено: ${item.title}`;
              });
            }}
          />
        </div>
        {message ? (
          <p className={`text-xs font-bold ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`} role="status">{message.text}</p>
        ) : null}
      </section>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            className="brand-input w-full pl-9"
            aria-label="Поиск по подписи"
            placeholder="Поиск по подписи"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav aria-label="Тип материала" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
          {kinds.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={kind === item}
              onClick={() => setKind(item)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold ${kind === item ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}
            >
              {item === "all" ? "Все" : materialKindLabel[item]}
            </button>
          ))}
        </nav>
      </div>

      {library.loading && !library.data ? <LoadingState label="Открываем библиотеку" /> : null}
      {library.error ? <ErrorState message={library.error} retry={library.reload} /> : null}
      {library.data && !counts ? (
        <EmptyState title="Здесь пока пусто" description={search ? "По этой подписи ничего не нашлось." : "Добавьте первую ссылку или файл."} />
      ) : null}

      <ul className="grid min-w-0 grid-cols-1 gap-2" data-testid="material-library-list">
        {items.map((item) => (
          <MaterialRow
            key={item.id}
            item={item}
            canEdit={canEditAll || item.createdById === user?.id}
            busy={busy}
            onRename={(next) => void run(`rename-${item.id}`, async () => { await materialsApi.rename(item.id, next); return "Подпись изменена"; })}
            onRemove={() => void run(`remove-${item.id}`, async () => { await materialsApi.remove(item.id); return "Материал убран из библиотеки"; })}
          />
        ))}
      </ul>
    </div>
  );
}

function MaterialRow({ item, canEdit, busy, onRename, onRemove }: {
  item: MaterialLibraryItem;
  canEdit: boolean;
  busy: string | null;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5" data-testid="material-library-item">
      <MaterialBadge badge={item.badge} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input className="brand-input w-full" aria-label="Новая подпись" value={draft} maxLength={255} onChange={(event) => setDraft(event.target.value)} />
        ) : (
          <p className="break-words text-sm font-bold text-ink">{item.title}</p>
        )}
        <p className="truncate text-[11px] text-stone-500">
          {materialKindLabel[item.kind]}{item.createdByName ? ` · ${item.createdByName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <a href={sameSiteMediaUrl(item.url)} target="_blank" rel="noreferrer" className={`${control} text-stone-700 hover:bg-stone-50`} aria-label={`Открыть ${item.title}`}>
          <ExternalLink size={14} />
        </a>
        {canEdit ? (
          editing ? (
            <button type="button" className={`${control} bg-ink text-white`} disabled={busy !== null || !draft.trim()} onClick={() => { onRename(draft); setEditing(false); }}>Сохранить</button>
          ) : (
            <>
              <button type="button" className={`${control} text-stone-700 hover:bg-stone-50`} aria-label={`Переименовать ${item.title}`} onClick={() => setEditing(true)}><Pencil size={14} /></button>
              <button type="button" className={`${control} text-red-700 hover:bg-red-50`} aria-label={`Убрать ${item.title}`} disabled={busy !== null} onClick={onRemove}><Trash2 size={14} /></button>
            </>
          )
        ) : null}
      </div>
    </li>
  );
}
