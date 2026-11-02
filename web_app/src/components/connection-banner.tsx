"use client";

import { CloudOff, WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { setSavedReadsEnabled } from "@/lib/api-client";
import { getConnectionStatus, subscribeConnectionStatus, type ConnectionStatus } from "@/lib/connection-status";

function snapshotTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return `${day}, ${time}`;
}

function bannerText(status: ConnectionStatus) {
  if (status.offline) return { icon: WifiOff, text: "Нет связи. Показываем сохранённое" };
  if (status.school.stale) {
    const at = snapshotTime(status.school.snapshotAt);
    return { icon: CloudOff, text: at ? `Нет связи со школой. Расписание на ${at}` : "Нет связи со школой. Показываем сохранённое расписание" };
  }
  if (status.school.unavailable) return { icon: CloudOff, text: "Нет связи со школой. Расписание сейчас не загрузилось" };
  return null;
}

/**
 * В-18: a strip under the student header when the network or the school's CRM is down,
 * so the student knows the lessons on screen may be out of date.
 */
export function ConnectionBanner() {
  const status = useSyncExternalStore(subscribeConnectionStatus, getConnectionStatus, getConnectionStatus);

  useEffect(() => {
    setSavedReadsEnabled(true);
    return () => setSavedReadsEnabled(false);
  }, []);

  const content = bannerText(status);
  if (!content) return null;
  const Icon = content.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
      className="sticky top-[calc(80px+env(safe-area-inset-top,0px))] z-20 flex min-h-10 items-center justify-center gap-2 bg-charcoal px-4 py-2 text-center text-sm font-semibold text-white print:hidden"
    >
      <Icon size={17} className="shrink-0 text-gold-bright" aria-hidden="true" />
      <span>{content.text}</span>
    </div>
  );
}
