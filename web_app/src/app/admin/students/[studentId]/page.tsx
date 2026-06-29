"use client";

import { ArrowLeft, Coins, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AchievementsWall } from "@/components/achievements-wall";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { StudentPhoneLine, WhatsAppLink } from "@/components/whatsapp-link";
import { useApiResource } from "@/hooks/use-api-resource";
import { formatFio } from "@/lib/name";
import { onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { studentsApi } from "@/lib/students-api";

export default function AdminStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const resource = useApiResource(() => studentsApi.get(studentId), [studentId]);

  if (resource.loading) return <LoadingState label="Открываем карточку ученика" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Ученик не найден" description="Проверьте ссылку." />;

  const student = resource.data;
  const studentName = student.fullName || formatFio(student);

  return (
    <>
      <Link href="/admin/students" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> К списку учеников
      </Link>

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Карточка ученика</p>
        <h1 className="font-display mt-2 text-4xl">{studentName}</h1>
        <div className="mt-4">
          <StudentPhoneLine phone={student.phone} login={student.login} email={student.email} />
        </div>
        <div className="mt-4">
          <WhatsAppLink phone={student.phone} label="Написать в WhatsApp" />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard icon={Star} label="Баллы" value={student.points.toLocaleString("ru-RU")} />
          <StatCard icon={Coins} label="Maestro Coins" value={student.coins.toLocaleString("ru-RU")} />
          <StatCard icon={Trophy} label="Пройдено уроков" value={String(student.completedLessons)} />
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <h2 className="font-display text-3xl">Достижения</h2>
        <p className="mt-2 text-sm text-stone-500">
          Получено {student.earnedAchievementsCount} из {student.achievements.length}
        </p>
        <div className="mt-5">
          <AchievementsWall achievements={student.achievements} compact />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Курсы</h2>
          <div className="mt-4 space-y-3">
            {student.enrollments.length ? student.enrollments.map((item) => (
              <div key={item.id} className="rounded-2xl bg-stone-50 p-4">
                <p className="font-semibold text-ink">{item.course.title}</p>
                <p className="mt-1 text-xs text-stone-500">{item.status}</p>
              </div>
            )) : <p className="text-sm text-stone-500">Курсы пока не выбраны</p>}
          </div>
        </div>

        <div className="rounded-[28px] border border-stone-200 bg-white p-6">
          <h2 className="font-display text-2xl">Онлайн-уроки</h2>
          <div className="mt-4 space-y-3">
            {student.onlineLessons.length ? student.onlineLessons.map((item) => (
              <Link key={item.id} href={`/admin/online-lessons/${item.id}`} className="block rounded-2xl bg-stone-50 p-4 transition hover:bg-stone-100">
                <p className="font-semibold text-ink">{item.directionTitle}</p>
                <p className="mt-1 text-xs text-stone-500">{onlineLessonStatusLabels[item.status as keyof typeof onlineLessonStatusLabels]}</p>
              </Link>
            )) : <p className="text-sm text-stone-500">Заявок на онлайн-уроки нет</p>}
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
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <Icon size={18} className="text-gold" />
      <p className="font-display mt-4 text-3xl">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
    </div>
  );
}
