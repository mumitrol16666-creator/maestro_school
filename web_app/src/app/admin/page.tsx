import { BookOpen, FolderOpen, Library, Newspaper } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

const sections = [
  { href: "/admin/directions", title: "Направления", text: "Создание и публикация направлений школы", icon: FolderOpen },
  { href: "/admin/courses", title: "Курсы и уроки", text: "Модули, уроки, материалы и домашние задания", icon: BookOpen },
  { href: "/admin/news", title: "Доска Maestro", text: "Новости, объявления и мероприятия", icon: Newspaper },
  { href: "/admin/media", title: "Медиатека", text: "Изображения, PDF и другие файлы", icon: Library },
];

export default function AdminPage() {
  return <><PageHeader eyebrow="Content CMS" title="Управление обучением" description="Создавайте и публикуйте образовательный контент Maestro без участия разработчика." /><div className="grid gap-5 md:grid-cols-2">{sections.map(({ href, title, text, icon: Icon }) => <Link key={href} href={href} className="card-hover rounded-[28px] border border-stone-200 bg-paper p-7 shadow-soft"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-gold"><Icon size={20} /></span><h2 className="font-display mt-8 text-3xl">{title}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{text}</p></Link>)}</div></>;
}
