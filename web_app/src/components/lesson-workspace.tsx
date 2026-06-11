"use client";

import { BookOpen, ClipboardList, FileStack, Pencil, Send, Trash2 } from "lucide-react";
import { AdminVideoValidation } from "@/components/admin-video-validation";
import { primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import type { CmsHomework, CmsLesson, CmsMaterial, CmsModule } from "@/types/cms";
import { LessonHomeworkPanel } from "./lesson-homework-panel";
import { LessonMaterialsPanel } from "./lesson-materials-panel";

export type LessonWorkspaceTab = "content" | "materials" | "homework";

interface LessonWorkspaceProps {
  lesson: CmsLesson;
  module: Pick<CmsModule, "title"> | null;
  activeTab: LessonWorkspaceTab;
  materials: CmsMaterial[];
  homeworkForm: Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">;
  hasHomework: boolean;
  materialForm: { title: string; type: string; url: string; sortOrder: number };
  materialFile: globalThis.File | null;
  replacingMaterialId: string | null;
  saving: boolean;
  formatSize: (bytes?: number) => string;
  formatDate: (value?: string) => string;
  onTabChange: (tab: LessonWorkspaceTab) => void;
  onEditLesson: () => void;
  onTogglePublish: () => void;
  onDeleteLesson: () => void;
  onDeleteVideo: () => void;
  onMaterialFormChange: (value: { title: string; type: string; url: string; sortOrder: number }) => void;
  onSelectMaterialFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenMediaPicker: () => void;
  onSaveMaterial: (event: React.FormEvent) => void;
  onReplaceMaterial: (item: CmsMaterial, event: React.ChangeEvent<HTMLInputElement>) => void;
  onMoveMaterial: (index: number, direction: -1 | 1) => void;
  onDeleteMaterial: (item: CmsMaterial) => void;
  onHomeworkChange: (value: Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">) => void;
  onSaveHomework: (event: React.FormEvent) => void;
  onArchiveHomework: () => void;
}

const tabs: Array<{ id: LessonWorkspaceTab; label: string; icon: typeof BookOpen }> = [
  { id: "content", label: "Содержание", icon: BookOpen },
  { id: "materials", label: "Материалы", icon: FileStack },
  { id: "homework", label: "Задание", icon: ClipboardList },
];

export function LessonWorkspace({
  lesson,
  module,
  activeTab,
  materials,
  homeworkForm,
  hasHomework,
  materialForm,
  materialFile,
  replacingMaterialId,
  saving,
  formatSize,
  formatDate,
  onTabChange,
  onEditLesson,
  onTogglePublish,
  onDeleteLesson,
  onDeleteVideo,
  onMaterialFormChange,
  onSelectMaterialFile,
  onOpenMediaPicker,
  onSaveMaterial,
  onReplaceMaterial,
  onMoveMaterial,
  onDeleteMaterial,
  onHomeworkChange,
  onSaveHomework,
  onArchiveHomework,
}: LessonWorkspaceProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-stone-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
            Урок · {module?.title ?? "Модуль"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-4xl">{lesson.title}</h2>
            <PublishBadge published={lesson.isPublished} />
          </div>
          <p className="mt-3 text-sm text-stone-500">
            {lesson.pointsReward} баллов · порядок {lesson.sortOrder}
            {materials.length > 0 && ` · ${materials.length} материалов`}
            {hasHomework && " · задание настроено"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onEditLesson} className={primaryButton}>
            <Pencil size={15} /> Редактировать
          </button>
          <button onClick={onTogglePublish} className={secondaryButton}>
            <Send size={15} />
            {lesson.isPublished ? "Снять с публикации" : "Опубликовать"}
          </button>
          <button onClick={onDeleteLesson} className={secondaryButton}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 rounded-[20px] border border-stone-200 bg-stone-50 p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badge = tab.id === "materials"
            ? materials.length || null
            : tab.id === "homework"
              ? (hasHomework ? "✓" : null)
              : null;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                active ? "bg-ink text-white shadow-soft" : "text-stone-600 hover:bg-white"
              }`}
            >
              <Icon size={15} className={active ? "text-gold" : "text-stone-400"} />
              {tab.label}
              {badge != null && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  active ? "bg-white/15 text-white" : "bg-stone-200 text-stone-600"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {activeTab === "content" && (
        <div className="space-y-6">
          {lesson.videoUrl ? (
            <section className="rounded-[24px] border border-stone-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Видео урока</p>
              <div className="mt-4">
                <AdminVideoValidation
                  videoUrl={lesson.videoUrl}
                  title={lesson.title}
                  onReplace={onEditLesson}
                  onDelete={onDeleteVideo}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-500">
              Видео ещё не добавлено. Откройте «Редактировать» и вставьте ссылку во вкладке настроек.
            </section>
          )}

          <section className="rounded-[24px] border border-stone-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Описание</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-600">
              {lesson.description || "Описание пока не добавлено."}
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => onTabChange("materials")} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left hover:bg-white">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Материалы</p>
              <p className="mt-2 text-sm font-bold text-ink">{materials.length ? `${materials.length} прикреплено` : "Добавить файлы"}</p>
            </button>
            <button type="button" onClick={() => onTabChange("homework")} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left hover:bg-white">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Задание</p>
              <p className="mt-2 text-sm font-bold text-ink">{hasHomework ? "Настроено" : "Создать задание"}</p>
            </button>
          </div>
        </div>
      )}

      {activeTab === "materials" && (
        <LessonMaterialsPanel
          materials={materials}
          materialForm={materialForm}
          materialFile={materialFile}
          replacingMaterialId={replacingMaterialId}
          saving={saving}
          formatSize={formatSize}
          formatDate={formatDate}
          onMaterialFormChange={onMaterialFormChange}
          onSelectFile={onSelectMaterialFile}
          onOpenMediaPicker={onOpenMediaPicker}
          onSubmit={onSaveMaterial}
          onReplace={onReplaceMaterial}
          onMove={onMoveMaterial}
          onDelete={onDeleteMaterial}
        />
      )}

      {activeTab === "homework" && (
        <LessonHomeworkPanel
          homeworkForm={homeworkForm}
          hasHomework={hasHomework}
          saving={saving}
          onChange={onHomeworkChange}
          onSubmit={onSaveHomework}
          onArchive={onArchiveHomework}
        />
      )}
    </div>
  );
}
