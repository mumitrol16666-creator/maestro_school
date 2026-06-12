"use client";

import { BookOpen, ClipboardList, FileStack, Send, Settings2, Trash2 } from "lucide-react";
import { AdminVideoValidation } from "@/components/admin-video-validation";
import { LessonEditorForm, type LessonFormValues } from "@/components/lesson-editor-form";
import { LessonHomeworkPanel } from "@/components/lesson-homework-panel";
import { LessonMaterialsPanel } from "@/components/lesson-materials-panel";
import { LessonSetupChecklist } from "@/components/lesson-setup-checklist";
import { primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import type { CmsHomework, CmsLesson, CmsMaterial, CmsModule } from "@/types/cms";

export type LessonWorkspaceTab = "content" | "materials" | "homework" | "settings";

interface LessonWorkspaceProps {
  lesson: CmsLesson;
  module: Pick<CmsModule, "title"> | null;
  activeTab: LessonWorkspaceTab;
  lessonForm: LessonFormValues;
  courseOptions: Array<{ id: string; title: string }>;
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
  onLessonFormChange: (value: LessonFormValues) => void;
  onSaveLesson: (event: React.FormEvent) => void;
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
  onHomeworkChange: (
    value: Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">
      | ((current: Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">) => Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">),
  ) => void;
  onSaveHomework: (event: React.FormEvent) => void;
  onArchiveHomework: () => void;
}

const tabs: Array<{ id: LessonWorkspaceTab; label: string; hint: string; icon: typeof BookOpen }> = [
  { id: "content", label: "Обзор", hint: "Что видит ученик", icon: BookOpen },
  { id: "materials", label: "Материалы", hint: "Файлы к уроку", icon: FileStack },
  { id: "homework", label: "Задание и тест", hint: "Сдача урока", icon: ClipboardList },
  { id: "settings", label: "Настройки", hint: "Название, видео, баллы", icon: Settings2 },
];

export function LessonWorkspace({
  lesson,
  module,
  activeTab,
  lessonForm,
  courseOptions,
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
  onLessonFormChange,
  onSaveLesson,
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
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onTogglePublish} className={primaryButton}>
            <Send size={15} />
            {lesson.isPublished ? "Снять с публикации" : "Опубликовать"}
          </button>
          <button onClick={onDeleteLesson} className={secondaryButton}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <LessonSetupChecklist
        hasVideo={!!lesson.videoUrl}
        hasDescription={!!lesson.description?.trim()}
        materialsCount={materials.length}
        hasHomework={hasHomework}
        homeworkType={hasHomework ? homeworkForm.type : null}
        activeTab={activeTab}
        onGoTo={onTabChange}
      />

      <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const needsAttention = tab.id === "materials"
            ? materials.length === 0
            : tab.id === "homework"
              ? !hasHomework
              : false;
          const badge = tab.id === "materials"
            ? (materials.length || null)
            : tab.id === "homework"
              ? (hasHomework ? (homeworkForm.type === "test" ? "Тест" : "Работа") : "!")
              : null;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-ink bg-ink text-white shadow-soft"
                  : needsAttention
                    ? "border-amber-200 bg-amber-50 hover:bg-amber-100/70"
                    : "border-stone-200 bg-stone-50 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon size={16} className={active ? "text-gold" : needsAttention ? "text-amber-600" : "text-stone-400"} />
                {badge != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    active
                      ? "bg-white/15 text-white"
                      : needsAttention
                        ? "bg-amber-200 text-amber-800"
                        : "bg-stone-200 text-stone-600"
                  }`}>
                    {badge}
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm font-bold ${active ? "text-white" : "text-ink"}`}>{tab.label}</p>
              <p className={`mt-1 text-xs ${active ? "text-white/70" : "text-stone-500"}`}>{tab.hint}</p>
            </button>
          );
        })}
      </nav>

      {activeTab === "content" && (
        <div className="space-y-6">
          {lesson.videoUrl ? (
            <section className="rounded-[24px] border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Видео урока</p>
                <button type="button" onClick={() => onTabChange("settings")} className="text-xs font-bold text-gold hover:underline">
                  Изменить ссылку
                </button>
              </div>
              <div className="mt-4">
                <AdminVideoValidation
                  videoUrl={lesson.videoUrl}
                  title={lesson.title}
                  onReplace={() => onTabChange("settings")}
                  onDelete={onDeleteVideo}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-dashed border-amber-300 bg-amber-50 p-5">
              <p className="text-sm font-bold text-amber-900">Видео не добавлено</p>
              <p className="mt-2 text-sm text-amber-800">Перейдите во вкладку «Настройки» и вставьте ссылку на ролик.</p>
              <button type="button" onClick={() => onTabChange("settings")} className={`${secondaryButton} mt-4`}>
                Открыть настройки
              </button>
            </section>
          )}

          <section className="rounded-[24px] border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Описание</p>
              <button type="button" onClick={() => onTabChange("settings")} className="text-xs font-bold text-gold hover:underline">
                Редактировать
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-600">
              {lesson.description || "Описание пока не добавлено."}
            </p>
          </section>
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

      {activeTab === "settings" && (
        <LessonEditorForm
          mode="edit-lesson"
          lessonTitle={lesson.title}
          values={lessonForm}
          courseOptions={courseOptions}
          saving={saving}
          onChange={onLessonFormChange}
          onSubmit={onSaveLesson}
          onClose={() => onTabChange("content")}
        />
      )}
    </div>
  );
}
