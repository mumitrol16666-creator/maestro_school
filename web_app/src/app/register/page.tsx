"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/back-button";
import { AuthHeroPanel } from "@/components/auth-hero-panel";
import { Brand } from "@/components/brand";
import { useAuth } from "@/components/auth-provider";
import { RegisterForm } from "@/components/register-form";
import type { PersonFields } from "@/lib/registration-form";
import { homePathForUser } from "@/lib/role-labels";
import { TRIAL_BOOKING_URL } from "@/lib/trial-booking";


export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  // The trial form hands over what the person has already typed (`/register?firstName=…&phone=…`).
  // A person who signs up is sent on by the form itself; only one who was already signed in is sent from here.
  const registering = useRef(false);
  const [initial, setInitial] = useState<Partial<PersonFields> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitial({
      firstName: params.get("firstName") ?? "",
      lastName: params.get("lastName") ?? "",
      phone: params.get("phone") ?? "",
    });
  }, []);

  useEffect(() => {
    if (!loading && user && !registering.current) router.replace(homePathForUser(user));
  }, [loading, router, user]);

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <AuthHeroPanel />
      <section className="flex items-start justify-center px-5 py-6 sm:p-12 lg:items-center">
        <div className="w-full max-w-md">
          <BackButton href="/login" label="Вход" className="-ml-1" />
          <div className="mb-6 mt-4 lg:hidden"><Brand /></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-gold-ink">Регистрация</p>
          <h1 className="font-display mt-3 text-balance text-4xl leading-tight sm:text-5xl">Создайте аккаунт Maestro</h1>
          <p className="mt-4 text-sm leading-6 text-stone-500">
            Онлайн-курсы Maestro: уроки, тесты и материалы. Первые уроки платных курсов бесплатные.
            Подтверждать телефон не нужно.
          </p>

          {initial ? <RegisterForm initial={initial} registering={registering} /> : <div className="mt-7 h-64" aria-hidden="true" />}

          <div className="mt-8 border-t border-stone-200 pt-5">
            <Link href="/login" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink transition hover:text-gold-ink">
              Уже есть аккаунт — войти <ArrowRight size={15} />
            </Link>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Хотите заниматься в школе с преподавателем?{" "}
              <a href={TRIAL_BOOKING_URL} className="font-bold text-gold-ink underline">Запишитесь на пробный урок</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
