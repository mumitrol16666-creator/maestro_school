"use client";

import { ArrowDown, ArrowLeft, ArrowUp, FilePlus, GripVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { inputClass, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import type { CmsLesson, CmsModule } from "@/types/cms";

export default function CourseBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const course = useApiResource(() => cmsApi.course(courseId), [courseId]);
  const allCourses = useApiResource(async () => (await cmsApi.courses("", "", 1, 100)).data.filter((item) => !item.deletedAt), []);
  const modules = useApiResource(() => cmsApi.modules(courseId), [courseId]);
  const [selectedModule, setSelectedModule] = useState<CmsModule | null>(null);
  const lessons = useApiResource(() => selectedModule ? cmsApi.lessons(selectedModule.id) : Promise.resolve([]), [selectedModule?.id]);
  const [selectedLesson, setSelectedLesson] = useState<CmsLesson | null>(null);
  const materials = useApiResource(() => selectedLesson ? cmsApi.materials(selectedLesson.id) : Promise.resolve([]), [selectedLesson?.id]);
  const homeworks = useApiResource(() => selectedLesson ? cmsApi.homeworks(selectedLesson.id) : Promise.resolve([]), [selectedLesson?.id]);
  const [moduleForm, setModuleForm] = useState({ title: "", description: "", sortOrder: 0, courseId });
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: "", description: "", videoUrl: "", pointsReward: 0, sortOrder: 0 });
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [materialForm, setMaterialForm] = useState({ title: "", type: "pdf", url: "", sortOrder: 0 });
  const [homeworkText, setHomeworkText] = useState("");

  useEffect(() => { setModuleForm((value) => ({ ...value, courseId })); }, [courseId]);
  useEffect(() => { if (modules.data?.length && !selectedModule) setSelectedModule(modules.data[0]); }, [modules.data, selectedModule]);
  useEffect(() => { setSelectedLesson(null); setEditingLessonId(null); }, [selectedModule?.id]);
  useEffect(() => { if (lessons.data?.length && !selectedLesson) setSelectedLesson(lessons.data[0]); }, [lessons.data, selectedLesson]);
  useEffect(() => { setHomeworkText(homeworks.data?.[0]?.description ?? ""); }, [homeworks.data]);

  if (course.loading || modules.loading) return <LoadingState label="Открываем конструктор курса" />;
  if (course.error || modules.error) return <ErrorState message={course.error || modules.error || "Ошибка"} retry={() => { void course.reload(); void modules.reload(); }} />;
  if (!course.data) return <EmptyState title="Курс не найден" description="Вернитесь к списку курсов." />;

  async function saveModule(event: FormEvent) {
    event.preventDefault();
    if (editingModuleId) await cmsApi.updateModule(editingModuleId, moduleForm);
    else await cmsApi.createModule(moduleForm);
    setEditingModuleId(null); setModuleForm({ title: "", description: "", sortOrder: 0, courseId }); await modules.reload();
  }
  async function saveLesson(event: FormEvent) {
    event.preventDefault(); if (!selectedModule) return;
    const body = { ...lessonForm, moduleId: selectedModule.id, videoUrl: lessonForm.videoUrl || null, description: lessonForm.description || null };
    if (editingLessonId) await cmsApi.updateLesson(editingLessonId, body); else await cmsApi.createLesson(body);
    setEditingLessonId(null); setLessonForm({ title: "", description: "", videoUrl: "", pointsReward: 0, sortOrder: 0 }); await lessons.reload();
  }
  async function saveMaterial(event: FormEvent) {
    event.preventDefault(); if (!selectedLesson) return;
    await cmsApi.createMaterial({ ...materialForm, lessonId: selectedLesson.id }); setMaterialForm({ title: "", type: "pdf", url: "", sortOrder: 0 }); await materials.reload();
  }
  async function saveHomework(event: FormEvent) {
    event.preventDefault(); if (!selectedLesson) return;
    if (homeworks.data?.[0]) await cmsApi.updateHomework(homeworks.data[0].id, { description: homeworkText }); else await cmsApi.createHomework({ lessonId: selectedLesson.id, description: homeworkText });
    await homeworks.reload();
  }
  async function moveMaterial(index: number, direction: -1 | 1) {
    const item = materials.data?.[index]; const target = materials.data?.[index + direction];
    if (!item || !target) return;
    await Promise.all([
      cmsApi.updateMaterial(item.id, { sortOrder: target.sortOrder }),
      cmsApi.updateMaterial(target.id, { sortOrder: item.sortOrder }),
    ]);
    await materials.reload();
  }
  function editModule(item: CmsModule) { setSelectedModule(item); setEditingModuleId(item.id); setModuleForm({ title: item.title, description: item.description ?? "", sortOrder: item.sortOrder, courseId: item.courseId }); }
  function editLesson(item: CmsLesson) { setSelectedLesson(item); setEditingLessonId(item.id); setLessonForm({ title: item.title, description: item.description ?? "", videoUrl: item.videoUrl ?? "", pointsReward: item.pointsReward, sortOrder: item.sortOrder }); }

  return <><Link href="/admin/courses" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500"><ArrowLeft size={16} /> Назад к курсам</Link>
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Конструктор курса</p><h1 className="font-display mt-2 text-5xl">{course.data.title}</h1><p className="mt-3 text-sm text-stone-500">{course.data.direction.title}</p></div><PublishBadge published={course.data.isPublished} archived={!!course.data.deletedAt} /></div>
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1fr_1.15fr]">
      <section className="space-y-4"><h2 className="font-display text-3xl">Модули</h2><div className="space-y-2">{modules.data?.map((item) => <button key={item.id} onClick={() => editModule(item)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${selectedModule?.id === item.id ? "border-gold bg-white" : "border-stone-200 bg-paper"}`}><GripVertical size={16} className="text-stone-300" /><span className="min-w-0 flex-1"><span className="block font-bold">{item.title}</span><span className="mt-1 block text-xs text-stone-400">{item._count.lessons} уроков · порядок {item.sortOrder}</span></span></button>)}</div><form onSubmit={saveModule} className="space-y-3 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><input required value={moduleForm.title} onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })} className={inputClass} placeholder="Название модуля" /><textarea value={moduleForm.description} onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })} className={inputClass} placeholder="Описание" /><div className="grid grid-cols-2 gap-3"><input type="number" min="0" value={moduleForm.sortOrder} onChange={(e) => setModuleForm({ ...moduleForm, sortOrder: Number(e.target.value) })} className={inputClass} /><select value={moduleForm.courseId} onChange={(e) => setModuleForm({ ...moduleForm, courseId: e.target.value })} className={inputClass}>{allCourses.data?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div><button className={`${primaryButton} w-full`}><Plus size={15} />{editingModuleId ? "Сохранить модуль" : "Создать модуль"}</button>{selectedModule && <button type="button" onClick={async () => { await cmsApi.deleteModule(selectedModule.id); setSelectedModule(null); setEditingModuleId(null); await modules.reload(); }} className={`${secondaryButton} w-full`}><Trash2 size={14} /> Удалить</button>}</form></section>
      <section className="space-y-4"><h2 className="font-display text-3xl">Уроки</h2>{!selectedModule ? <EmptyState title="Выберите модуль" description="После выбора здесь появятся уроки." /> : <><div className="space-y-2">{lessons.data?.map((item) => <button key={item.id} onClick={() => editLesson(item)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${selectedLesson?.id === item.id ? "border-gold bg-white" : "border-stone-200 bg-paper"}`}><span className="font-display text-xl">{item.sortOrder}</span><span className="min-w-0 flex-1"><span className="block font-bold">{item.title}</span><span className="mt-1 flex gap-2 text-xs text-stone-400">{item.pointsReward} баллов · {item._count.materials} материалов</span></span><PublishBadge published={item.isPublished} /></button>)}</div><form onSubmit={saveLesson} className="space-y-3 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><input required value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} className={inputClass} placeholder="Название урока" /><MarkdownEditor label="Описание" value={lessonForm.description} onChange={(description) => setLessonForm({ ...lessonForm, description })} /><input type="url" value={lessonForm.videoUrl} onChange={(e) => setLessonForm({ ...lessonForm, videoUrl: e.target.value })} className={inputClass} placeholder="YouTube / Vimeo / Cloudflare Stream URL" /><div className="grid grid-cols-2 gap-3"><input type="number" min="0" value={lessonForm.pointsReward} onChange={(e) => setLessonForm({ ...lessonForm, pointsReward: Number(e.target.value) })} className={inputClass} placeholder="Баллы" /><input type="number" min="0" value={lessonForm.sortOrder} onChange={(e) => setLessonForm({ ...lessonForm, sortOrder: Number(e.target.value) })} className={inputClass} placeholder="Порядок" /></div><button className={`${primaryButton} w-full`}><Plus size={15} />{editingLessonId ? "Сохранить урок" : "Создать урок"}</button>{selectedLesson && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={async () => { await cmsApi.publishLesson(selectedLesson.id, !selectedLesson.isPublished); await lessons.reload(); }} className={secondaryButton}>{selectedLesson.isPublished ? "Снять" : "Опубликовать"}</button><button type="button" onClick={async () => { await cmsApi.deleteLesson(selectedLesson.id); setSelectedLesson(null); setEditingLessonId(null); await lessons.reload(); }} className={secondaryButton}><Trash2 size={14} /></button></div>}</form></>}</section>
      <section className="space-y-4"><h2 className="font-display text-3xl">Наполнение урока</h2>{!selectedLesson ? <EmptyState title="Выберите урок" description="Здесь появятся материалы и домашнее задание." /> : <><div className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Материалы</p><div className="mt-4 space-y-2">{materials.data?.map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3"><FilePlus size={16} className="text-gold" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</span><span className="text-xs text-stone-400">#{item.sortOrder}</span><button disabled={index === 0} aria-label="Поднять материал" onClick={() => moveMaterial(index, -1)}><ArrowUp size={14} /></button><button disabled={index === (materials.data?.length ?? 0) - 1} aria-label="Опустить материал" onClick={() => moveMaterial(index, 1)}><ArrowDown size={14} /></button><button aria-label="Удалить материал" onClick={async () => { await cmsApi.deleteMaterial(item.id); await materials.reload(); }}><Trash2 size={14} /></button></div>)}</div><form onSubmit={saveMaterial} className="mt-4 space-y-3"><input required value={materialForm.title} onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })} className={inputClass} placeholder="Название материала" /><div className="grid grid-cols-[130px_1fr] gap-3"><select value={materialForm.type} onChange={(e) => setMaterialForm({ ...materialForm, type: e.target.value })} className={inputClass}><option value="pdf">PDF</option><option value="image">Изображение</option><option value="link">Ссылка</option><option value="file">Файл</option></select><input required type="url" value={materialForm.url} onChange={(e) => setMaterialForm({ ...materialForm, url: e.target.value })} className={inputClass} placeholder="URL из медиатеки" /></div><input type="number" min="0" value={materialForm.sortOrder} onChange={(e) => setMaterialForm({ ...materialForm, sortOrder: Number(e.target.value) })} className={inputClass} placeholder="Порядок" /><button className={`${secondaryButton} w-full`}><Plus size={14} /> Прикрепить материал</button></form></div><form onSubmit={saveHomework} className="rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"><p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-gold">Домашнее задание</p><MarkdownEditor value={homeworkText} onChange={setHomeworkText} label="Описание задания" /><button className={`${primaryButton} mt-4 w-full`}>{homeworks.data?.[0] ? "Сохранить задание" : "Создать задание"}</button>{homeworks.data?.[0] && <button type="button" onClick={async () => { await cmsApi.deleteHomework(homeworks.data![0].id); setHomeworkText(""); await homeworks.reload(); }} className={`${secondaryButton} mt-2 w-full`}><Trash2 size={14} /> Архивировать</button>}</form></>}</section>
    </div>
  </>;
}
