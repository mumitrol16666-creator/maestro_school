"use client";

import { Compass } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { CourseCard } from "@/components/course-card";
import { ScreenError } from "@/components/app-error-screen";
import { EmptyState } from "@/components/data-states";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { toCourse } from "@/lib/adapters";
import { api } from "@/lib/api-client";
import { courseRewardLine, isExternalStudent } from "@/lib/course-access-format";
import { formatCount } from "@/lib/plural";

export default function CoursesPage() {
  const { user } = useAuth();
  const external = isExternalStudent(user);
  const rewardLine = courseRewardLine(user?.productFeatures?.rewardEconomyV2);
  const resource = useApiResource(async () => {
    const [directions, courses] = await Promise.all([api.directions(), api.courses()]);
    return { directions, courses: courses.map((course, index) => toCourse(course, index)) };
  }, []);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="list" label="Загружаем курсы" />;
  if (resource.error && !resource.data) return <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />;
  if (!resource.data?.courses.length) return <EmptyState title="Курсов пока нет" description="Опубликованные курсы появятся здесь." />;

  const myCourses = resource.data.courses.filter((course) => course.access === "enrolled");
  const availableCourses = resource.data.courses.filter((course) => course.access === "available");
  const directionsCount = resource.data.directions.length;

  return (
    <>
      <PageHeader eyebrow="Каталог Maestro" title={external ? "Курсы" : "Ваше обучение"} description={external ? "Выбери курс и учись в своём темпе. У платных курсов первые уроки бесплатные." : "Выберите опубликованный курс или продолжайте уже начатое обучение."} action={<span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold"><Compass size={15} /> {formatCount(directionsCount, ["направление", "направления", "направлений"])}</span>} />
      <section>
        <div className="mb-5 flex items-end justify-between"><div><h2 className="font-display text-3xl">Мои курсы</h2><p className="mt-1 text-sm text-stone-500">Продолжайте в удобном темпе</p></div><span className="text-xs font-bold uppercase tracking-wide text-stone-500">{formatCount(myCourses.length, ["курс", "курса", "курсов"])}</span></div>
        {myCourses.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{myCourses.map((course) => <CourseCard key={course.id} course={course} rewardLine={rewardLine} />)}</div> : <EmptyState title="Нет активных курсов" description={external ? "Выбери курс в списке ниже и нажми «Начать обучение»." : "После зачисления курс появится в этом разделе."} />}
      </section>
      {!!availableCourses.length && <section className="mt-12"><div className="mb-5"><h2 className="font-display text-3xl">Доступные курсы</h2><p className="mt-1 text-sm text-stone-500">{external ? "Начни с любого курса" : "Следующие шаги в вашем музыкальном пути"}</p></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{availableCourses.map((course) => <CourseCard key={course.id} course={course} rewardLine={rewardLine} />)}</div></section>}
    </>
  );
}
