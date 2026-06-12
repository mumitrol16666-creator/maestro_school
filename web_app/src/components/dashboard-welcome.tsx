"use client";

import { ArrowRight, BookOpen, Coins, Newspaper, Star, Video } from "lucide-react";
import Link from "next/link";
import { AchievementsWall } from "@/components/achievements-wall";
import { CourseCard } from "@/components/course-card";
import { useAuth } from "@/components/auth-provider";
import type { Course } from "@/types";
import type { ApiNewsPost, StudentAchievementItem } from "@/types/api";

export function DashboardWelcome({
  points,
  courses,
  news,
  achievements,
  earnedCount,
  totalAchievements,
}: {
  points: number;
  courses: Course[];
  news: ApiNewsPost[];
  achievements: StudentAchievementItem[];
  earnedCount: number;
  totalAchievements: number;
}) {
  const { user } = useAuth();
  const firstName = user?.firstName || "ученик";
  const available = courses.filter((course) => course.access === "available");
  const inProgress = courses.filter((course) => course.access === "enrolled" && course.progress < 100);
  const completed = courses.filter((course) => course.access === "enrolled" && course.progress >= 100);
  const latestPost = news[0];

  const section =
    inProgress.length > 0
      ? {
          title: "Продолжите обучение",
          description: "Откройте курс и продолжайте с того урока, на котором остановились.",
          items: inProgress,
        }
      : available.length > 0
        ? {
            title: "С чего начать",
            description: "Выберите опубликованный курс — первый урок откроется сразу после зачисления.",
            items: available,
          }
        : completed.length > 0
          ? {
              title: "Пройденные курсы",
              description: "Все ваши курсы завершены. Можно открыть курс повторно или дождаться новых программ.",
              items: completed,
            }
          : {
              title: "С чего начать",
              description: "Выберите опубликованный курс — первый урок откроется сразу после зачисления.",
              items: [],
            };

  return (
    <>
      <div className="mb-9">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">Личный кабинет Maestro</p>
        <h1 className="font-display text-4xl sm:text-5xl">Добрый день, {firstName}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
          Добро пожаловать в кабинет. Выберите курс, запишитесь на онлайн-урок или посмотрите новости школы — всё в одном месте.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Star} label="Баллы" value={points.toLocaleString("ru-RU")} />
        <StatCard icon={Coins} label="Maestro Coins" value={(user?.coins ?? 0).toLocaleString("ru-RU")} />
        <QuickLink href="/courses" icon={BookOpen} label="Курсы" hint="Начать обучение" />
        <QuickLink href="/online-lessons" icon={Video} label="Онлайн-урок" hint="Запись с преподавателем" />
      </section>

      <section className="mt-8 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl">{section.title}</h2>
            <p className="mt-2 text-sm text-stone-500">{section.description}</p>
          </div>
          <Link href="/courses" className="inline-flex items-center gap-2 text-sm font-bold text-gold hover:underline">
            Все курсы <ArrowRight size={15} />
          </Link>
        </div>

        {section.items.length ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {section.items.slice(0, 3).map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-6 text-sm text-stone-500">
            Опубликованные курсы скоро появятся. Пока можно записаться на{" "}
            <Link href="/online-lessons" className="font-bold text-ink hover:underline">
              онлайн-урок
            </Link>
            .
          </div>
        )}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        {latestPost ? (
          <Link href="/board" className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Доска Maestro</p>
              <Newspaper size={18} className="text-gold" />
            </div>
            <p className="font-display mt-6 text-2xl">{latestPost.title}</p>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-500">{latestPost.excerpt}</p>
          </Link>
        ) : (
          <Link href="/board" className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Доска Maestro</p>
            <p className="font-display mt-6 text-2xl">Новости школы</p>
            <p className="mt-3 text-sm text-stone-500">Объявления и события Maestro</p>
          </Link>
        )}

        <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl">Достижения</h2>
              <p className="mt-1 text-sm text-stone-500">
                {earnedCount} из {totalAchievements} получено
              </p>
            </div>
            <Link href="/progress" className="text-sm font-bold text-gold hover:underline">
              Все
            </Link>
          </div>
          <div className="mt-4">
            <AchievementsWall achievements={achievements} compact />
          </div>
        </div>
      </section>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="premium-surface rounded-[24px] p-5 shadow-soft">
      <Icon size={18} className="text-gold" />
      <p className="font-display mt-4 text-3xl">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="card-hover rounded-[24px] border border-stone-200 bg-white p-5 shadow-soft"
    >
      <Icon size={18} className="text-gold" />
      <p className="mt-4 text-sm font-bold text-ink">{label}</p>
      <p className="mt-1 text-xs text-stone-500">{hint}</p>
    </Link>
  );
}
