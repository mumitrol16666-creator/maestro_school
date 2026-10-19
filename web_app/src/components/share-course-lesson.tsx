"use client";

import { MonitorPlay, LoaderCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { materialsApi } from "@/lib/materials-api";
import type { ShareableCourse } from "@/types/materials";

const control = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Plan 1.12: send any course lesson to the student as material. They watch the bare lesson —
 * no start, no submission, and their course progress does not move.
 */
export function ShareCourseLesson({ crmStudentId, appLinked }: { crmStudentId: string; appLinked: boolean }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<ShareableCourse[] | null>(null);
  const [courseId, setCourseId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open || courses) return;
    materialsApi.courseLessons()
      .then((rows) => {
        setCourses(rows);
        setCourseId(rows[0]?.id ?? "");
        setLessonId(rows[0]?.lessons[0]?.id ?? "");
      })
      .catch(() => setMessage({ tone: "error", text: "Не удалось загрузить курсы" }));
  }, [open, courses]);

  const course = courses?.find((row) => row.id === courseId) ?? null;

  async function send() {
    if (!lessonId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await materialsApi.shareLesson(crmStudentId, lessonId, note);
      setMessage({ tone: "ok", text: `${result.resent ? "Отправлен ещё раз" : "Отправлен"}: «${result.title}». Ученик получит уведомление.` });
      setNote("");
      setOpen(false);
    } catch (reason) {
      setMessage({ tone: "error", text: reason instanceof ApiError ? reason.message : "Не удалось отправить урок" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4" data-testid="share-course-lesson">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><MonitorPlay size={14} /> Урок из курса</p>
        <button
          type="button"
          disabled={!appLinked}
          onClick={() => setOpen((current) => !current)}
          className={`${control} min-h-8 border border-stone-200 px-2 text-stone-700`}
        >
          {open ? "Скрыть" : "Отправить урок курса"}
        </button>
      </div>
      {!appLinked ? <p className="mt-2 text-xs text-stone-500">Ученик ещё не подключил приложение.</p> : null}
      {message ? <p className={`mt-2 text-xs font-semibold ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p> : null}
      {open ? (
        <div className="mt-3 grid min-w-0 gap-2">
          {!courses ? <p className="text-xs text-stone-500">Загружаем курсы…</p> : null}
          {courses && !courses.length ? <p className="text-xs text-stone-500">Опубликованных уроков в курсах пока нет.</p> : null}
          {courses?.length ? (
            <>
              <label className="text-[11px] font-bold text-stone-500">
                Курс
                <select
                  className="brand-input mt-1 w-full"
                  value={courseId}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setLessonId(courses.find((row) => row.id === event.target.value)?.lessons[0]?.id ?? "");
                  }}
                >
                  {courses.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-bold text-stone-500">
                Урок
                <select className="brand-input mt-1 w-full" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                  {course?.lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle} · {lesson.title}{lesson.hasVideo ? " · видео" : ""}</option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label="Комментарий ученику"
                className="w-full rounded-lg border border-stone-200 bg-white p-2 text-sm"
                rows={2}
                maxLength={1000}
                placeholder="Комментарий ученику, необязательно"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="text-[11px] text-stone-500">Ученик откроет урок для просмотра: без сдачи и без прогресса курса.</p>
              <button type="button" disabled={busy || !lessonId} onClick={() => void send()} className={`${control} justify-self-start bg-ink text-white`}>
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Отправить ученику
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
