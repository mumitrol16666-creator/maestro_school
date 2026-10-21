"use client";

import { BookmarkPlus, Sparkles, X } from "lucide-react";

/**
 * Plan 1.14: phrases above a summary or homework field — what this lesson suggests, the teacher's own
 * and the school's. A tap adds the phrase; the current text can be kept as the teacher's own phrase.
 */
export function LessonTextHints({
  testId,
  fromLesson,
  own,
  school,
  disabled,
  canSave,
  onInsert,
  onSave,
  onRemoveOwn,
}: {
  testId: string;
  fromLesson: string[];
  own: Array<{ id: string; text: string }>;
  school: string[];
  disabled: boolean;
  canSave: boolean;
  onInsert: (text: string) => void;
  onSave: () => void;
  onRemoveOwn: (id: string) => void;
}) {
  const chip = "min-h-9 rounded-lg px-2.5 py-1 text-left text-[12px] font-semibold transition disabled:opacity-50";
  return (
    <div className="mt-2 space-y-2" data-testid={testId}>
      {fromLesson.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
            <Sparkles size={12} /> Из урока
          </span>
          {fromLesson.map((text) => (
            <button key={text} type="button" disabled={disabled} onClick={() => onInsert(text)}
              className={`${chip} border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}>
              + {text}
            </button>
          ))}
        </div>
      ) : null}
      {own.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">Мои</span>
          {own.map((item) => (
            <span key={item.id} className="inline-flex items-stretch overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
              <button type="button" disabled={disabled} onClick={() => onInsert(item.text)}
                className={`${chip} rounded-none text-amber-950 hover:bg-amber-100`}>
                + {item.text}
              </button>
              <button type="button" disabled={disabled} onClick={() => onRemoveOwn(item.id)}
                aria-label={`Удалить шаблон: ${item.text}`}
                className="grid w-8 place-items-center border-l border-amber-200 text-amber-800 hover:bg-amber-100">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {school.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">Школа</span>
          {school.map((text) => (
            <button key={text} type="button" disabled={disabled} onClick={() => onInsert(text)}
              className={`${chip} border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-ink`}>
              + {text}
            </button>
          ))}
        </div>
      ) : null}
      {canSave ? (
        <button type="button" disabled={disabled} onClick={onSave}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-bold text-stone-500 hover:bg-stone-100 hover:text-ink">
          <BookmarkPlus size={14} /> Сохранить текст как мой шаблон
        </button>
      ) : null}
    </div>
  );
}
