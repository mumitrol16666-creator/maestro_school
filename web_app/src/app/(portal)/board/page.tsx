"use client";

import { CalendarDays, Newspaper, Pin, Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { toBoardPost } from "@/lib/adapters";
import { api } from "@/lib/api-client";

export default function BoardPage() {
  const resource = useApiResource(async () => (await api.news()).map(toBoardPost), []);
  if (resource.loading) return <LoadingState label="Загружаем доску Maestro" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.length) return <EmptyState title="Новостей пока нет" description="Объявления и события школы появятся здесь." />;

  return (
    <>
      <PageHeader eyebrow="Будьте в курсе" title="Доска Maestro" description="Новости школы, важные объявления и события музыкального сообщества." />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-5">
          {resource.data.map((post) => (
            <article key={post.id} className="card-hover overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft">
              {post.featured && <div className="h-2" style={{ backgroundColor: post.accent }} />}
              <div className="p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: post.accent }}><Newspaper size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3 text-xs"><span className="font-bold uppercase tracking-[0.15em] text-gold">{post.category}</span><span className="text-stone-400">{post.date}</span>{post.featured && <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 font-semibold text-stone-500"><Pin size={11} /> Закреплено</span>}</div><h2 className="font-display mt-4 text-3xl sm:text-4xl">{post.title}</h2><p className="mt-4 text-sm leading-7 text-stone-500">{post.excerpt}</p></div></div></div>
            </article>
          ))}
        </section>
        <aside className="space-y-5">
          <div className="rounded-[28px] bg-ink p-6 text-white shadow-soft"><CalendarDays size={21} className="text-gold" /><p className="font-display mt-8 text-3xl">{resource.data[0].date}</p><p className="mt-2 text-sm text-white/55">{resource.data[0].title}</p></div>
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><Users size={21} className="text-gold" /><p className="font-display mt-6 text-3xl">Музыка объединяет</p><p className="mt-3 text-sm leading-6 text-stone-500">Здесь собраны важные новости и истории сообщества Maestro.</p></div>
        </aside>
      </div>
    </>
  );
}
