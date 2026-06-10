"use client";

import { Newspaper } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { toBoardPost } from "@/lib/adapters";
import { api } from "@/lib/api-client";
import { MarkdownContent } from "@/components/markdown-content";

export default function BoardPage() {
  const resource = useApiResource(async () => (await api.news()).map(toBoardPost), []);
  if (resource.loading) return <LoadingState label="Загружаем доску Maestro" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.length) return <EmptyState title="Новостей пока нет" description="Новости и объявления школы появятся здесь." />;

  return (
    <>
      <PageHeader eyebrow="Будьте в курсе" title="Доска Maestro" description="Опубликованные новости и объявления школы." />
      <div className="max-w-4xl">
        <section className="space-y-5">
          {resource.data.map((post) => (
            <article key={post.id} className="card-hover overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft">
              <div className="p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: post.accent }}><Newspaper size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3 text-xs text-stone-400"><span>{post.date}</span><span>{post.author}</span></div><h2 className="font-display mt-4 text-3xl sm:text-4xl">{post.title}</h2><MarkdownContent className="mt-4" >{post.content}</MarkdownContent></div></div></div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
