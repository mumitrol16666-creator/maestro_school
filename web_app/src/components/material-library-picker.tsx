"use client";

import { FileUp, Link2, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { fileToBase64 } from "@/lib/file-upload";
import { inferFileMimeType } from "@/lib/media-utils";
import { materialsApi } from "@/lib/materials-api";
import type { MaterialLibraryItem } from "@/types/materials";

/** A link pasted straight into the search: saved as it is, without the ad marker some sites add. */
function pastedLink(query: string) {
  const value = query.trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.hash === "#google_vignette") url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** A readable caption guess from the link, e.g. «Tatyana kurtukova odnogo — mychords.net»; the teacher can rewrite it. */
export function captionFromLink(link: string) {
  const url = new URL(link);
  const host = url.hostname.replace(/^www\./, "");
  const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
  let slug = segment;
  try {
    slug = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  slug = slug.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^\d+[-_]+/, "").replace(/[-_+]+/g, " ").trim();
  if (!slug || /^(watch|index|view|edit)$/i.test(slug) || /^\d+$/.test(slug)) return host;
  return `${slug.charAt(0).toUpperCase()}${slug.slice(1)} — ${host}`.slice(0, 255);
}

const control = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

export function MaterialBadge({ badge }: { badge: string }) {
  return (
    <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-stone-600">
      {badge}
    </span>
  );
}

/**
 * Plan 1.12: start typing a material's caption and pick it from the school's library, with its type
 * shown (MP4, PNG, ссылка). A new link or file goes to the library too, so the next teacher finds it.
 */
export function MaterialLibraryPicker({
  onPick,
  disabled = false,
  label = "Материал из библиотеки",
}: {
  onPick: (item: MaterialLibraryItem) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MaterialLibraryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<"link" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const link = pastedLink(query);

  // A pasted link gets a caption guess right away, so saving it is one click.
  useEffect(() => {
    setCaption(link ? captionFromLink(link) : "");
  }, [link]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      materialsApi.library({ search: query, limit: 8 })
        .then((rows) => { if (!cancelled) setItems(rows); })
        .catch(() => { if (!cancelled) setItems([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, open]);

  function pick(item: MaterialLibraryItem) {
    onPick(item);
    setQuery("");
    setOpen(false);
    setAdding(null);
    setLinkUrl("");
    setCaption("");
  }

  async function addLink(url: string, title: string) {
    if (!url.trim() || !title.trim()) {
      setError("Вставьте ссылку и напишите подпись");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pick(await materialsApi.addLink(url.trim(), title.trim()));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось добавить ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      setError("Файл больше 20 МБ. Видео лучше загрузить на YouTube и добавить ссылкой.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pick(await materialsApi.uploadFile({
        filename: file.name,
        mimeType: inferFileMimeType(file),
        contentBase64: await fileToBase64(file),
        title: query.trim() || undefined,
      }));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="relative min-w-0"
      data-testid="material-library-picker"
      onBlur={(event) => {
        // Moving between the search and the fields inside the list keeps the list open.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        window.setTimeout(() => setOpen(false), 150);
      }}
    >
      <label htmlFor={inputId} className="block text-[10px] font-black uppercase tracking-wider text-stone-500">{label}</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={query}
        placeholder="Начните писать название: «бой восьмыми», «аккорды Am»…"
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        className="brand-input mt-1 w-full"
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
          onMouseDown={(event) => {
            // Clicks on options and buttons keep the focus in the search; the link fields take it.
            if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
          }}
        >
          {loading && !items.length ? <p className="px-3 py-2 text-xs text-stone-500">Ищем в библиотеке…</p> : null}
          {link ? (
            <div className="grid gap-2 px-2 pb-2 pt-1" data-testid="material-pasted-link">
              <p className="text-xs text-stone-500">{items.length ? "Эта ссылка уже есть в библиотеке — выберите её выше." : "Это ссылка. Проверьте подпись и сохраните."}</p>
              {items.length ? null : (
                <>
                  <input
                    type="text"
                    aria-label="Подпись к ссылке"
                    className="brand-input"
                    value={caption}
                    maxLength={255}
                    onChange={(event) => setCaption(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addLink(link, caption);
                      }
                    }}
                  />
                  <button type="button" className={`${control} justify-self-start bg-ink text-white`} disabled={busy} onClick={() => void addLink(link, caption)}>
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Сохранить в библиотеку и выбрать
                  </button>
                </>
              )}
            </div>
          ) : null}
          {!link && !loading && !items.length ? (
            <p className="px-3 py-2 text-xs text-stone-500">{query.trim() ? "В библиотеке такого нет. Добавьте ссылку или файл ниже." : "Библиотека пока пустая."}</p>
          ) : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(item)}
              className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-amber-50"
            >
              <MaterialBadge badge={item.badge} />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{item.title}</span>
            </button>
          ))}
          {link ? null : (
          <div className="mt-1 flex flex-wrap gap-1 border-t border-stone-100 px-1 pt-2">
            <button type="button" className={`${control} text-stone-700 hover:bg-stone-50`} onClick={() => setAdding("link")}>
              <Link2 size={14} /> Добавить ссылку
            </button>
            <button type="button" className={`${control} text-stone-700 hover:bg-stone-50`} onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />} Загрузить файл
            </button>
          </div>
          )}
          {!link && adding === "link" ? (
            <div className="grid gap-2 px-2 pb-2 pt-1">
              <input
                type="url"
                aria-label="Ссылка на материал"
                className="brand-input"
                placeholder="https://…"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <p className="text-[11px] text-stone-500">Подпись — то, что написано в поле выше.</p>
              <button type="button" className={`${control} justify-self-start bg-ink text-white`} disabled={busy} onClick={() => void addLink(linkUrl, query)}>
                <Plus size={14} /> Сохранить в библиотеку и выбрать
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs font-bold text-red-700" role="alert">{error}</p> : null}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
