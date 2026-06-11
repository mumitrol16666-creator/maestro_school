"use client";

import { ArrowDown, ArrowUp, Copy, ExternalLink, FilePlus, FolderOpen, Pencil, Plus, Send, Trash2, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AdminVideoValidation } from "@/components/admin-video-validation";
import { AdminTestBuilder } from "@/components/admin-test-builder";
import { Breadcrumbs, ConfirmDialog, type ConfirmRequest, SaveStatus, type SaveState } from "@/components/admin-feedback";
import { inputClass, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { CourseReadiness } from "@/components/course-readiness";
import { CourseStructureTree } from "@/components/course-structure-tree";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MediaPicker } from "@/components/media-picker";
import { useApiResource } from "@/hooks/use-api-resource";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { cmsApi } from "@/lib/cms-api";
import { uploadMediaFile } from "@/lib/file-upload";
import { materialTypeFromFile, materialTypeFromMedia, titleFromFilename } from "@/lib/media-utils";
import type { CmsHomework, CmsMaterial, CmsMaterialUsage, CmsMedia } from "@/types/cms";

type EditorMode = "none" | "new-module" | "edit-module" | "new-lesson" | "edit-lesson";
const emptyModule = (courseId: string) => ({ title: "", description: "", sortOrder: 0, courseId });
const emptyLesson = { title: "", description: "", videoUrl: "", pointsReward: 0, sortOrder: 0 };
const emptyMaterial = { title: "", type: "pdf", url: "", sortOrder: 0 };
const emptyHomework: Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions"> = {
  description: "",
  type: "assignment",
  passingScore: 70,
  testQuestions: [],
};
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const formatSize = (bytes?: number) => bytes === undefined ? "Размер неизвестен" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "Дата неизвестна";
const usageText = (usages: CmsMaterialUsage[]) => usages.length
  ? `Используется: ${usages.map((usage) => `${usage.lesson.module.course.title} → ${usage.lesson.title}`).join("; ")}.`
  : "Других использований файла не найдено.";

export default function CourseBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const tree = useApiResource(() => cmsApi.courseTree(courseId), [courseId]);
  const allCourses = useApiResource(async () => (await cmsApi.courses("", "", 1, 100)).data.filter((item) => !item.deletedAt), []);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("none");
  const [moduleForm, setModuleForm] = useState(emptyModule(courseId));
  const [moduleBaseline, setModuleBaseline] = useState(emptyModule(courseId));
  const [lessonForm, setLessonForm] = useState(emptyLesson);
  const [lessonBaseline, setLessonBaseline] = useState(emptyLesson);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [materialFile, setMaterialFile] = useState<globalThis.File | null>(null);
  const [replacingMaterialId, setReplacingMaterialId] = useState<string | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [homeworkForm, setHomeworkForm] = useState(emptyHomework);
  const [homeworkBaseline, setHomeworkBaseline] = useState(emptyHomework);
  const [operation, setOperation] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const modules = tree.data?.modules ?? [];
  const selectedModule = modules.find((item) => item.id === selectedModuleId) ?? null;
  const selectedLessonSummary = selectedModule?.lessons.find((item) => item.id === selectedLessonId) ?? null;
  const lesson = useApiResource(() => selectedLessonId ? cmsApi.lesson(selectedLessonId) : Promise.resolve(null), [selectedLessonId]);
  const selectedLesson = lesson.data?.id === selectedLessonId ? lesson.data : null;
  const materials = useApiResource(() => selectedLessonId ? cmsApi.materials(selectedLessonId) : Promise.resolve([]), [selectedLessonId]);
  const homeworks = useApiResource(() => selectedLessonId ? cmsApi.homeworks(selectedLessonId) : Promise.resolve([]), [selectedLessonId]);
  const moduleDirty = (editorMode === "new-module" || editorMode === "edit-module") && !same(moduleForm, moduleBaseline);
  const lessonDirty = (editorMode === "new-lesson" || editorMode === "edit-lesson") && !same(lessonForm, lessonBaseline);
  const materialDirty = !!selectedLesson && (!same(materialForm, emptyMaterial) || !!materialFile);
  const homeworkDirty = !!selectedLesson && !same(homeworkForm, homeworkBaseline);
  const isDirty = moduleDirty || lessonDirty || materialDirty || homeworkDirty;
  const saveState: SaveState = operation === "saving" ? "saving" : operation === "error" ? "error" : isDirty ? "dirty" : operation === "saved" ? "saved" : "idle";

  useUnsavedChanges(isDirty);

  useEffect(() => {
    if (!tree.data?.modules.length || selectedModuleId) return;
    const first = tree.data.modules[0];
    setSelectedModuleId(first.id);
    setExpanded(new Set([first.id]));
  }, [selectedModuleId, tree.data]);

  useEffect(() => {
    const homework = homeworks.data?.[0];
    const value = homework ? {
      description: homework.description,
      type: homework.type,
      passingScore: homework.passingScore,
      testQuestions: homework.testQuestions ?? [],
    } : emptyHomework;
    setHomeworkForm(value);
    setHomeworkBaseline(value);
  }, [homeworks.data, selectedLessonId]);

  const breadcrumbs = useMemo(() => [
    { label: "Курсы", href: "/admin/courses" },
    { label: tree.data?.title ?? "Курс" },
    ...(selectedModule ? [{ label: selectedModule.title }] : []),
    ...(selectedLessonSummary ? [{ label: selectedLessonSummary.title }] : []),
  ], [selectedLessonSummary, selectedModule, tree.data?.title]);

  if (tree.loading && !tree.data) return <LoadingState label="Открываем конструктор курса" />;
  if (tree.error || !tree.data) return <ErrorState message={tree.error || "Курс не найден"} retry={tree.reload} />;

  function discardDrafts() {
    setEditorMode("none");
    setModuleForm(emptyModule(courseId)); setModuleBaseline(emptyModule(courseId));
    setLessonForm(emptyLesson); setLessonBaseline(emptyLesson);
    setMaterialForm(emptyMaterial); setMaterialFile(null);
    setHomeworkForm(homeworkBaseline);
    setOperation("idle"); setOperationError(null);
  }

  function canDiscard() {
    return !isDirty || window.confirm("Есть несохранённые изменения. Продолжить и потерять их?");
  }

  function selectModule(moduleId: string) {
    if (!canDiscard()) return;
    discardDrafts(); setSelectedModuleId(moduleId); setSelectedLessonId(null);
  }

  function selectLesson(moduleId: string, lessonId: string) {
    if (!canDiscard()) return;
    discardDrafts(); setSelectedModuleId(moduleId); setSelectedLessonId(lessonId); setExpanded((value) => new Set(value).add(moduleId));
  }

  function startNewModule() {
    if (!canDiscard()) return;
    discardDrafts();
    setSelectedModuleId(null); setSelectedLessonId(null);
    const value = { ...emptyModule(courseId), sortOrder: modules.length ? Math.max(...modules.map((item) => item.sortOrder)) + 1 : 1 };
    setModuleForm(value); setModuleBaseline(emptyModule(courseId)); setEditorMode("new-module");
  }

  function startEditModule() {
    if (!selectedModule || !canDiscard()) return;
    discardDrafts();
    const value = { title: selectedModule.title, description: selectedModule.description ?? "", sortOrder: selectedModule.sortOrder, courseId: selectedModule.courseId };
    setModuleForm(value); setModuleBaseline(value); setEditorMode("edit-module");
  }

  function startNewLesson(moduleId = selectedModuleId) {
    if (!moduleId || !canDiscard()) return;
    discardDrafts(); setSelectedModuleId(moduleId); setSelectedLessonId(null); setExpanded((value) => new Set(value).add(moduleId));
    const module = modules.find((item) => item.id === moduleId);
    const value = { ...emptyLesson, sortOrder: module?.lessons.length ? Math.max(...module.lessons.map((item) => item.sortOrder)) + 1 : 1 };
    setLessonForm(value); setLessonBaseline(emptyLesson); setEditorMode("new-lesson");
  }

  function startEditLesson() {
    if (!selectedLesson || !canDiscard()) return;
    discardDrafts();
    const value = { title: selectedLesson.title, description: selectedLesson.description ?? "", videoUrl: selectedLesson.videoUrl ?? "", pointsReward: selectedLesson.pointsReward, sortOrder: selectedLesson.sortOrder };
    setLessonForm(value); setLessonBaseline(value); setEditorMode("edit-lesson");
  }

  async function runOperation(action: () => Promise<void>) {
    setOperation("saving"); setOperationError(null);
    try {
      await action(); setOperation("saved"); return true;
    } catch (reason) {
      setOperation("error"); setOperationError(reason instanceof Error ? reason.message : "Не удалось сохранить изменения"); return false;
    }
  }

  async function saveModule(event: FormEvent) {
    event.preventDefault();
    await runOperation(async () => {
      if (editorMode === "edit-module" && selectedModule) {
        await cmsApi.updateModule(selectedModule.id, moduleForm); setModuleBaseline(moduleForm);
      } else {
        const created = await cmsApi.createModule(moduleForm); setSelectedModuleId(created.id); setEditorMode("none");
      }
      await tree.reload();
    });
  }

  async function saveLesson(event: FormEvent) {
    event.preventDefault(); if (!selectedModuleId) return;
    await runOperation(async () => {
      const body = { ...lessonForm, moduleId: selectedModuleId, videoUrl: lessonForm.videoUrl || null, description: lessonForm.description || null };
      if (editorMode === "edit-lesson" && selectedLesson) {
        await cmsApi.updateLesson(selectedLesson.id, body); setLessonBaseline(lessonForm);
      } else {
        const created = await cmsApi.createLesson(body); setSelectedLessonId(created.id); setEditorMode("none");
      }
      await Promise.all([tree.reload(), selectedLessonId ? lesson.reload() : Promise.resolve()]);
    });
  }

  async function saveMaterial(event: FormEvent) {
    event.preventDefault(); if (!selectedLesson) return;
    await runOperation(async () => {
      const uploaded = materialFile ? await uploadMediaFile(materialFile) : null;
      const type = uploaded ? materialTypeFromMedia(uploaded) : materialForm.type;
      await cmsApi.createMaterial({
        ...materialForm,
        type,
        url: uploaded?.url ?? materialForm.url,
        lessonId: selectedLesson.id,
      });
      setMaterialForm(emptyMaterial); setMaterialFile(null); await Promise.all([materials.reload(), tree.reload()]);
    });
  }

  async function quickAttachMedia(media: CmsMedia) {
    if (!selectedLesson) return;
    await runOperation(async () => {
      await cmsApi.createMaterial({
        title: titleFromFilename(media.originalFilename),
        type: materialTypeFromMedia(media),
        url: media.url,
        sortOrder: materials.data?.length ?? 0,
        lessonId: selectedLesson.id,
      });
      await Promise.all([materials.reload(), tree.reload()]);
    });
  }

  async function saveHomework(event: FormEvent) {
    event.preventDefault(); if (!selectedLesson) return;
    await runOperation(async () => {
      const body = {
        ...homeworkForm,
        testQuestions: homeworkForm.type === "test" ? homeworkForm.testQuestions : null,
      };
      if (homeworks.data?.[0]) await cmsApi.updateHomework(homeworks.data[0].id, body);
      else await cmsApi.createHomework({ lessonId: selectedLesson.id, ...body });
      setHomeworkBaseline(homeworkForm); await Promise.all([homeworks.reload(), tree.reload()]);
    });
  }

  async function moveMaterial(index: number, direction: -1 | 1) {
    const item = materials.data?.[index]; const target = materials.data?.[index + direction];
    if (!item || !target) return;
    await runOperation(async () => {
      await Promise.all([cmsApi.updateMaterial(item.id, { sortOrder: target.sortOrder }), cmsApi.updateMaterial(target.id, { sortOrder: item.sortOrder })]);
      await materials.reload();
    });
  }

  function selectMaterialFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMaterialFile(file);
    if (file) {
      setMaterialForm((value) => ({
        ...value,
        title: value.title || titleFromFilename(file.name),
        type: materialTypeFromFile(file),
        sortOrder: value.sortOrder || (materials.data?.length ?? 0),
      }));
    }
    event.target.value = "";
  }

  async function replaceMaterial(item: CmsMaterial, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setReplacingMaterialId(item.id);
    await runOperation(async () => {
      const uploaded = await uploadMediaFile(file);
      await cmsApi.updateMaterial(item.id, {
        url: uploaded.url,
        type: materialTypeFromMedia(uploaded),
      });
      await materials.reload();
    });
    setReplacingMaterialId(null);
  }

  async function prepareMaterialDelete(item: CmsMaterial) {
    setOperation("saving"); setOperationError(null);
    try {
      const usages = await cmsApi.materialUsages(item.id);
      setOperation("idle");
      requestDelete("Удалить материал?", `${usageText(usages)} Материал «${item.title}» будет откреплён от этого урока. Файл останется в медиатеке.`, async () => {
        await cmsApi.deleteMaterial(item.id); await Promise.all([materials.reload(), tree.reload()]);
      });
    } catch (reason) {
      setOperation("error"); setOperationError(reason instanceof Error ? reason.message : "Не удалось проверить использование файла");
    }
  }

  function requestDelete(title: string, description: string, action: () => Promise<void>, confirmLabel = "Удалить") {
    setConfirmRequest({ title, description, confirmLabel, onConfirm: async () => {
      setConfirmBusy(true);
      try { await action(); setConfirmRequest(null); setOperation("saved"); }
      catch (reason) { setOperation("error"); setOperationError(reason instanceof Error ? reason.message : "Не удалось удалить"); }
      finally { setConfirmBusy(false); }
    } });
  }

  function moduleEditor() {
    return <form onSubmit={saveModule} className="space-y-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editorMode === "new-module" ? "Новый модуль" : "Редактирование модуля"}</p><h2 className="font-display mt-2 text-4xl">{editorMode === "new-module" ? "Добавить модуль" : selectedModule?.title}</h2></div>
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Название<input required value={moduleForm.title} onChange={(event) => setModuleForm({ ...moduleForm, title: event.target.value })} className={`${inputClass} mt-2`} /></label>
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Описание<textarea value={moduleForm.description} onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })} className={`${inputClass} mt-2 min-h-28`} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Порядок<input type="number" min="0" value={moduleForm.sortOrder} onChange={(event) => setModuleForm({ ...moduleForm, sortOrder: Number(event.target.value) })} className={`${inputClass} mt-2`} /></label><label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Курс<select value={moduleForm.courseId} onChange={(event) => setModuleForm({ ...moduleForm, courseId: event.target.value })} className={`${inputClass} mt-2`}>{allCourses.data?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
      <div className="flex flex-wrap gap-3"><button className={primaryButton}>{operation === "saving" ? "Сохраняем..." : "Сохранить модуль"}</button><button type="button" onClick={() => { if (canDiscard()) discardDrafts(); }} className={secondaryButton}>Закрыть редактор</button></div>
    </form>;
  }

  function lessonEditor() {
    return <form onSubmit={saveLesson} className="space-y-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">{editorMode === "new-lesson" ? "Новый урок" : "Настройки урока"}</p><h2 className="font-display mt-2 text-4xl">{editorMode === "new-lesson" ? "Добавить урок" : selectedLesson?.title}</h2></div>
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Название<input required value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} className={`${inputClass} mt-2`} /></label>
      <MarkdownEditor label="Описание" value={lessonForm.description} onChange={(description) => setLessonForm({ ...lessonForm, description })} />
      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Видео URL<input ref={videoInputRef} type="url" value={lessonForm.videoUrl} onChange={(event) => setLessonForm({ ...lessonForm, videoUrl: event.target.value })} className={`${inputClass} mt-2`} placeholder="YouTube / Vimeo / Cloudflare Stream" /></label>
      <AdminVideoValidation videoUrl={lessonForm.videoUrl} title={lessonForm.title} onReplace={() => videoInputRef.current?.focus()} onDelete={() => setLessonForm({ ...lessonForm, videoUrl: "" })} />
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Баллы<input type="number" min="0" value={lessonForm.pointsReward} onChange={(event) => setLessonForm({ ...lessonForm, pointsReward: Number(event.target.value) })} className={`${inputClass} mt-2`} /></label><label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Порядок<input type="number" min="0" value={lessonForm.sortOrder} onChange={(event) => setLessonForm({ ...lessonForm, sortOrder: Number(event.target.value) })} className={`${inputClass} mt-2`} /></label></div>
      <div className="flex flex-wrap gap-3"><button className={primaryButton}>{operation === "saving" ? "Сохраняем..." : "Сохранить урок"}</button><button type="button" onClick={() => { if (canDiscard()) discardDrafts(); }} className={secondaryButton}>Закрыть редактор</button></div>
    </form>;
  }

  return <>
    <Breadcrumbs items={breadcrumbs} />
    <header className="mb-7 flex flex-col gap-4 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{tree.data.direction.title}</p><h1 className="font-display mt-2 text-5xl">{tree.data.title}</h1></div>
      <div className="flex flex-wrap items-center gap-3"><SaveStatus state={saveState} /><PublishBadge published={tree.data.isPublished} archived={!!tree.data.deletedAt} /></div>
    </header>
    {operationError && <div className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{operationError}</div>}
    <CourseReadiness modules={modules} onSelectLesson={selectLesson} />
    <div className="grid items-start gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
      <CourseStructureTree modules={modules} query={query} expanded={expanded} selectedModuleId={selectedModuleId} selectedLessonId={selectedLessonId} onQueryChange={setQuery} onToggleModule={(id) => setExpanded((value) => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelectModule={selectModule} onSelectLesson={selectLesson} onAddModule={startNewModule} onAddLesson={startNewLesson} />
      <main className="min-w-0 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft lg:p-8">
        {(editorMode === "new-module" || editorMode === "edit-module") ? moduleEditor() : (editorMode === "new-lesson" || editorMode === "edit-lesson") ? lessonEditor() : selectedLessonId && lesson.loading && !selectedLesson ? <LoadingState label="Загружаем урок" /> : selectedLessonId && lesson.error ? <ErrorState message={lesson.error} retry={lesson.reload} /> : selectedLesson ? <>
          <div className="flex flex-col gap-4 border-b border-stone-100 pb-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Урок · {selectedModule?.title}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="font-display text-4xl">{selectedLesson.title}</h2><PublishBadge published={selectedLesson.isPublished} /></div><p className="mt-3 text-sm text-stone-500">{selectedLesson.pointsReward} баллов · порядок {selectedLesson.sortOrder}</p></div><div className="flex flex-wrap gap-2"><button onClick={startEditLesson} className={primaryButton}><Pencil size={15} /> Редактировать</button><button onClick={() => void runOperation(async () => { await cmsApi.publishLesson(selectedLesson.id, !selectedLesson.isPublished); await Promise.all([tree.reload(), lesson.reload()]); })} className={secondaryButton}><Send size={15} />{selectedLesson.isPublished ? "Снять" : "Опубликовать"}</button><button onClick={() => { if (canDiscard()) requestDelete("Удалить урок?", `Урок «${selectedLesson.title}» будет отправлен в архив.`, async () => { await cmsApi.deleteLesson(selectedLesson.id); setSelectedLessonId(null); await tree.reload(); }); }} className={secondaryButton}><Trash2 size={15} /></button></div></div>
          {selectedLesson.videoUrl && <section className="mt-7"><AdminVideoValidation videoUrl={selectedLesson.videoUrl} title={selectedLesson.title} onReplace={startEditLesson} onDelete={() => requestDelete("Удалить видео из урока?", "Ссылка на видео будет удалена из урока. Само видео у провайдера останется без изменений.", async () => { await cmsApi.updateLesson(selectedLesson.id, { videoUrl: null }); await Promise.all([lesson.reload(), tree.reload()]); })} /></section>}
          <section className="mt-7"><h3 className="font-display text-3xl">Описание</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">{selectedLesson.description || "Описание пока не добавлено."}</p></section>
          <section className="mt-8 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Материалы</p><p className="mt-1 text-xs text-stone-400">{materials.data?.length ?? 0} прикреплено</p></div><FilePlus size={18} className="text-gold" /></div>
            <div className="mt-4 space-y-3">{materials.data?.map((item, index) => <article key={item.id} className="rounded-2xl border border-stone-100 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">{item.type}</span><h4 className="truncate text-sm font-bold">{item.title}</h4></div>
                  <p className="mt-2 truncate text-sm text-stone-600">{item.media?.originalFilename ?? item.url.split("/").pop()}</p>
                  <p className="mt-1 text-xs text-stone-400">{formatSize(item.media?.size)} · загружен {formatDate(item.media?.createdAt ?? item.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={item.url} target="_blank" rel="noreferrer" className={secondaryButton}><ExternalLink size={14} /> Открыть</a>
                  <label className={`${secondaryButton} cursor-pointer ${replacingMaterialId === item.id ? "opacity-50" : ""}`}><Upload size={14} />{replacingMaterialId === item.id ? "Замена..." : "Заменить"}<input disabled={replacingMaterialId === item.id} type="file" accept={item.type === "pdf" ? "application/pdf,.pdf" : item.type === "image" ? "image/*" : undefined} onChange={(event) => void replaceMaterial(item, event)} className="hidden" /></label>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(item.url)} className={secondaryButton}><Copy size={14} /> Ссылка</button>
                  <button type="button" disabled={index === 0} onClick={() => void moveMaterial(index, -1)} className={secondaryButton} aria-label="Поднять материал"><ArrowUp size={14} /></button>
                  <button type="button" disabled={index === (materials.data?.length ?? 0) - 1} onClick={() => void moveMaterial(index, 1)} className={secondaryButton} aria-label="Опустить материал"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => void prepareMaterialDelete(item)} className={secondaryButton}><Trash2 size={14} /></button>
                </div>
              </div>
            </article>)}</div>
            <form onSubmit={saveMaterial} className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_130px_1.5fr_100px]"><input required value={materialForm.title} onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} className={inputClass} placeholder="Название материала" /><select value={materialForm.type} onChange={(event) => setMaterialForm({ ...materialForm, type: event.target.value })} className={inputClass}><option value="pdf">PDF</option><option value="image">Изображение</option><option value="link">Ссылка</option><option value="file">Файл</option></select><input required={!materialFile} type="url" value={materialForm.url} onChange={(event) => setMaterialForm({ ...materialForm, url: event.target.value })} className={inputClass} placeholder={materialFile ? materialFile.name : "URL или загрузите файл ниже"} /><input type="number" min="0" value={materialForm.sortOrder} onChange={(event) => setMaterialForm({ ...materialForm, sortOrder: Number(event.target.value) })} className={inputClass} aria-label="Порядок материала" /></div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setMediaPickerOpen(true)} className={secondaryButton}><FolderOpen size={14} /> Из медиатеки</button>
                <label className={`${secondaryButton} cursor-pointer`}><Upload size={14} /> Выбрать файл<input type="file" accept="application/pdf,image/*" onChange={selectMaterialFile} className="hidden" /></label>
                {materialFile && <span className="max-w-sm truncate text-xs font-semibold text-stone-500">{materialFile.name} · {formatSize(materialFile.size)}</span>}
                <button className={primaryButton}><Plus size={14} /> Прикрепить материал</button>
              </div>
            </form>
          </section>
          <form onSubmit={saveHomework} className="mt-8 rounded-[24px] border border-stone-200 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Домашнее задание</p>
                <p className="mt-1 text-xs text-stone-400">{homeworks.data?.[0] ? "Задание создано" : "Задание не создано"}</p>
              </div>
              {homeworks.data?.[0] && (
                <button
                  type="button"
                  onClick={() => requestDelete("Архивировать домашнее задание?", "Ученики больше не увидят это задание.", async () => {
                    await cmsApi.deleteHomework(homeworks.data![0].id);
                    setHomeworkForm(emptyHomework);
                    setHomeworkBaseline(emptyHomework);
                    await Promise.all([homeworks.reload(), tree.reload()]);
                  }, "Архивировать")}
                  className={secondaryButton}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Формат сдачи
                <select
                  value={homeworkForm.type}
                  onChange={(event) => setHomeworkForm({
                    ...homeworkForm,
                    type: event.target.value as CmsHomework["type"],
                    testQuestions: event.target.value === "test" ? homeworkForm.testQuestions : [],
                  })}
                  className={`${inputClass} mt-2`}
                >
                  <option value="assignment">Работа на проверку</option>
                  <option value="test">Тест</option>
                </select>
              </label>
              {homeworkForm.type === "test" && (
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Проходной балл, %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={homeworkForm.passingScore}
                    onChange={(event) => setHomeworkForm({ ...homeworkForm, passingScore: Number(event.target.value) })}
                    className={`${inputClass} mt-2`}
                  />
                </label>
              )}
            </div>
            <div className="mt-4">
              <MarkdownEditor value={homeworkForm.description} onChange={(description) => setHomeworkForm({ ...homeworkForm, description })} label="Описание задания" />
            </div>
            {homeworkForm.type === "test" && (
              <AdminTestBuilder questions={homeworkForm.testQuestions ?? []} onChange={(testQuestions) => setHomeworkForm({ ...homeworkForm, testQuestions })} />
            )}
            <button
              disabled={!homeworkForm.description.trim() || (homeworkForm.type === "test" && !homeworkForm.testQuestions?.length)}
              className={`${primaryButton} mt-4 disabled:opacity-50`}
            >
              {homeworks.data?.[0] ? "Сохранить задание" : "Создать задание"}
            </button>
          </form>
        </> : selectedModule ? <div><div className="flex flex-col gap-4 border-b border-stone-100 pb-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Модуль</p><h2 className="font-display mt-2 text-4xl">{selectedModule.title}</h2><p className="mt-3 text-sm text-stone-500">{selectedModule.lessons.length} уроков · порядок {selectedModule.sortOrder}</p></div><div className="flex flex-wrap gap-2"><button onClick={startEditModule} className={primaryButton}><Pencil size={15} /> Редактировать</button><button onClick={() => startNewLesson(selectedModule.id)} className={secondaryButton}><Plus size={15} /> Урок</button><button onClick={() => requestDelete("Удалить модуль?", `Модуль «${selectedModule.title}» будет отправлен в архив вместе с его уроками.`, async () => { await cmsApi.deleteModule(selectedModule.id); setSelectedModuleId(null); await tree.reload(); })} className={secondaryButton}><Trash2 size={15} /></button></div></div><p className="mt-7 whitespace-pre-wrap text-sm leading-7 text-stone-600">{selectedModule.description || "Описание модуля пока не добавлено."}</p></div> : <EmptyState title="Выберите элемент курса" description="Откройте модуль или урок в дереве слева." />}
      </main>
    </div>
    <MediaPicker
      open={mediaPickerOpen}
      onClose={() => setMediaPickerOpen(false)}
      onSelect={(media) => void quickAttachMedia(media)}
      title="Прикрепить из медиатеки"
    />
    <ConfirmDialog request={confirmRequest} busy={confirmBusy} onClose={() => { if (!confirmBusy) setConfirmRequest(null); }} />
  </>;
}
