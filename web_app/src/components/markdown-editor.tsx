"use client";

import { Bold, Heading2, Image, Italic, Link, List } from "lucide-react";
import { useRef } from "react";

export function MarkdownEditor({ value, onChange, label = "Содержание" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function wrap(before: string, after = before) {
    const field = ref.current;
    if (!field) return;
    const start = field.selectionStart; const end = field.selectionEnd;
    onChange(`${value.slice(0, start)}${before}${value.slice(start, end) || "текст"}${after}${value.slice(end)}`);
  }
  const tools = [
    { icon: Heading2, action: () => wrap("## ", "") },
    { icon: Bold, action: () => wrap("**") },
    { icon: Italic, action: () => wrap("*") },
    { icon: List, action: () => wrap("- ", "") },
    { icon: Link, action: () => wrap("[", "](https://)") },
    { icon: Image, action: () => wrap("![описание](", ")") },
  ];
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500">{label}</span><span className="block overflow-hidden rounded-2xl border border-stone-200 bg-white focus-within:border-gold"><span className="flex gap-1 border-b border-stone-100 p-2">{tools.map(({ icon: Icon, action }, index) => <button key={index} type="button" onClick={action} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"><Icon size={15} /></button>)}</span><textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-40 w-full resize-y p-4 text-sm outline-none" /></span></label>;
}
