"use client";

import { BoardPostCard } from "@/components/board-post-card";
import { FounderMessage } from "@/components/founder-message";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { toBoardPost } from "@/lib/adapters";
import { api } from "@/lib/api-client";

export default function BoardPage() {
  const resource = useApiResource(async () => (await api.news()).map(toBoardPost), []);
  if (resource.loading) return <LoadingState label="Загружаем доску Maestro" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.length) {
    return (
      <>
        <PageHeader
          eyebrow="Будьте в курсе"
          title="Доска Maestro"
          description="Новости и объявления школы."
        />
        <EmptyState title="Новостей пока нет" description="Новости и объявления школы появятся здесь." />
        <FounderMessage className="mt-10 max-w-4xl" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Будьте в курсе"
        title="Доска Maestro"
        description="Новости и объявления школы. Длинные записи можно развернуть кнопкой «Читать полностью»."
      />
      <div className="max-w-4xl">
        <section className="space-y-5">
          {resource.data.map((post) => (
            <BoardPostCard key={post.id} post={post} />
          ))}
        </section>
        <FounderMessage className="mt-10" />
      </div>
    </>
  );
}
