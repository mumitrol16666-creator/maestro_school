"use client";

import { Compass } from "lucide-react";
import { CourseCard } from "@/components/course-card";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { toCourse } from "@/lib/adapters";
import { api } from "@/lib/api-client";

export default function CoursesPage() {
  const resource = useApiResource(async () => {
    const [directions, courses] = await Promise.all([api.directions(), api.courses()]);
    return { directions, courses: courses.map((course, index) => toCourse(course, index)) };
  }, []);

  if (resource.loading) return <LoadingState label="Загружаем курсы" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.courses.length) return <EmptyState title="Курсов пока нет" description="Опубликованные курсы появятся здесь." />;

  const myCourses = resource.data.courses.filter((course) => course.access === "enrolled");
  const availableCourses = resource.data.courses.filter((course) => course.access === "available");
  const directionsCount = resource.data.directions.length;

  return (
    <>
      <PageHeader eyebrow="Каталог Maestro" title="Ваше обучение" description="Выберите опубликованный курс или продолжайте уже начатое обучение." action={<span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold"><Compass size={15} /> {directionsCount} направлений</span>} />
      <section>
        <div className="mb-5 flex items-end justify-between"><div><h2 className="font-display text-3xl">Мои курсы</h2><p className="mt-1 text-sm text-stone-500">Продолжайте в удобном темпе</p></div><span className="text-xs font-bold uppercase tracking-widest text-stone-400">{myCourses.length} курса</span></div>
        {myCourses.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{myCourses.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <EmptyState title="Нет активных курсов" description="После зачисления курс появится в этом разделе." />}
      </section>
      {!!availableCourses.length && <section className="mt-12"><div className="mb-5"><h2 className="font-display text-3xl">Доступные курсы</h2><p className="mt-1 text-sm text-stone-500">Следующие шаги в вашем музыкальном пути</p></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{availableCourses.map((course) => <CourseCard key={course.id} course={course} />)}</div></section>}
    </>
  );
}
