"use client";

import { ArrowDown, ArrowUp, Copy, ExternalLink, FilePlus, FolderOpen, Plus, Trash2, Upload } from "lucide-react";
import { ChangeEvent } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import type { CmsMaterial } from "@/types/cms";

interface MaterialFormValues {
  title: string;
  type: string;
  url: string;
  sortOrder: number;
}

interface LessonMaterialsPanelProps {
  materials: CmsMaterial[];
  materialForm: MaterialFormValues;
  materialFile: globalThis.File | null;
  replacingMaterialId: string | null;
  saving: boolean;
  formatSize: (bytes?: number) => string;
  formatDate: (value?: string) => string;
  onMaterialFormChange: (value: MaterialFormValues) => void;
  onSelectFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenMediaPicker: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onReplace: (item: CmsMaterial, event: ChangeEvent<HTMLInputElement>) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (item: CmsMaterial) => void;
}

export function LessonMaterialsPanel({
  materials,
  materialForm,
  materialFile,
  replacingMaterialId,
  saving,
  formatSize,
  formatDate,
  onMaterialFormChange,
  onSelectFile,
  onOpenMediaPicker,
  onSubmit,
  onReplace,
  onMove,
  onDelete,
}: LessonMaterialsPanelProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-stone-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <FilePlus size={20} className="text-gold" />
          <div>
            <h3 className="font-display text-3xl">Материалы урока</h3>
            <p className="mt-1 text-sm text-stone-500">
              Здесь прикрепляются PDF, изображения и ссылки — ученик скачает их на странице урока.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-wider text-stone-400">
          Прикреплено: {materials.length}
        </p>
      </div>

      {materials.length > 0 && (
        <div className="space-y-3">
          {materials.map((item, index) => (
            <article key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      {item.type}
                    </span>
                    <h4 className="truncate text-sm font-bold">{item.title}</h4>
                  </div>
                  <p className="mt-2 truncate text-sm text-stone-600">
                    {item.media?.originalFilename ?? item.url.split("/").pop()}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {formatSize(item.media?.size)} · загружен {formatDate(item.media?.createdAt ?? item.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={item.url} target="_blank" rel="noreferrer" className={secondaryButton}>
                    <ExternalLink size={14} /> Открыть
                  </a>
                  <label className={`${secondaryButton} cursor-pointer ${replacingMaterialId === item.id ? "opacity-50" : ""}`}>
                    <Upload size={14} />
                    {replacingMaterialId === item.id ? "Замена..." : "Заменить"}
                    <input
                      disabled={replacingMaterialId === item.id}
                      type="file"
                      accept={item.type === "pdf" ? "application/pdf,.pdf" : item.type === "image" ? "image/*" : undefined}
                      onChange={(event) => onReplace(item, event)}
                      className="hidden"
                    />
                  </label>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(item.url)} className={secondaryButton}>
                    <Copy size={14} /> Ссылка
                  </button>
                  <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className={secondaryButton} aria-label="Поднять материал">
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={index === materials.length - 1}
                    onClick={() => onMove(index, 1)}
                    className={secondaryButton}
                    aria-label="Опустить материал"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => onDelete(item)} className={secondaryButton}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Добавить материал</p>
        <h4 className="font-display mt-2 text-2xl">Новый файл или ссылка</h4>

        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-stone-500">
          Название
          <input
            required
            value={materialForm.title}
            onChange={(event) => onMaterialFormChange({ ...materialForm, title: event.target.value })}
            className={`${inputClass} mt-2`}
            placeholder="Например: Ноты к уроку"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Тип
            <select
              value={materialForm.type}
              onChange={(event) => onMaterialFormChange({ ...materialForm, type: event.target.value })}
              className={`${inputClass} mt-2`}
            >
              <option value="pdf">PDF</option>
              <option value="image">Изображение</option>
              <option value="link">Ссылка</option>
              <option value="file">Файл</option>
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Порядок
            <input
              type="number"
              min="0"
              value={materialForm.sortOrder}
              onChange={(event) => onMaterialFormChange({ ...materialForm, sortOrder: Number(event.target.value) })}
              className={`${inputClass} mt-2`}
            />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Источник</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onOpenMediaPicker} className={secondaryButton}>
              <FolderOpen size={14} /> Из медиатеки
            </button>
            <label className={`${secondaryButton} cursor-pointer`}>
              <Upload size={14} /> Загрузить файл
              <input type="file" accept="application/pdf,image/*" onChange={onSelectFile} className="hidden" />
            </label>
          </div>
          {materialFile && (
            <p className="mt-3 text-sm font-semibold text-stone-600">
              {materialFile.name} · {formatSize(materialFile.size)}
            </p>
          )}
          <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-stone-500">
            Или вставьте ссылку
            <input
              required={!materialFile}
              type="url"
              value={materialForm.url}
              onChange={(event) => onMaterialFormChange({ ...materialForm, url: event.target.value })}
              className={`${inputClass} mt-2`}
              placeholder={materialFile ? "Файл уже выбран — ссылка не нужна" : "https://..."}
              disabled={!!materialFile}
            />
          </label>
        </div>

        <button className={`${primaryButton} mt-5`} disabled={saving}>
          <Plus size={14} /> Прикрепить материал
        </button>
      </form>
    </div>
  );
}
