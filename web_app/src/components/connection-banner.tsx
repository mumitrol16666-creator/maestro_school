"use client";

import { CloudOff, WifiOff } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { setSavedReadsEnabled } from "@/lib/api-client";
import { announceReconnect, getConnectionStatus, subscribeConnectionStatus, type ConnectionStatus } from "@/lib/connection-status";
import { invalidateStudentHome } from "@/lib/student-home";

function snapshotTime(value: string | number | null) {
  if (value == null) return null;
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
  if (status.offline) {
    const at = status.servedSaved ? snapshotTime(status.savedAt) : null;
    return { icon: WifiOff, text: at ? `Нет связи. Показываем сохранённое на ${at}` : "Нет связи" };
  }
  if (status.school.stale) {
    const at = snapshotTime(status.school.snapshotAt);
    return { icon: CloudOff, text: at ? `Нет связи со школой. Расписание на ${at}` : "Нет связи со школой. Показываем сохранённое расписание" };
  }
  if (status.school.unavailable) return { icon: CloudOff, text: "Нет связи со школой. Расписание сейчас не загрузилось" };
  return null;
}

/**
 * В-18: a strip under the student header when the network or the school's CRM is down,
 * so the student knows the lessons on screen may be out of date. When the connection comes
 * back, the screens read their data again.
 */
export function ConnectionBanner() {
  const status = useSyncExternalStore(subscribeConnectionStatus, getConnectionStatus, getConnectionStatus);
  const wasOffline = useRef(false);

  useEffect(() => {
    setSavedReadsEnabled(true);
    return () => setSavedReadsEnabled(false);
  }, []);

  useEffect(() => {
    if (status.offline) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    invalidateStudentHome();
    announceReconnect();
  }, [status.offline]);

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
