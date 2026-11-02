"use client";

import { useEffect } from "react";
import { AppErrorScreen } from "@/components/app-error-screen";

function isStaleBundle(error: Error) {
  return /chunk|dynamically imported module|module script/i.test(`${error.name} ${error.message}`);
}

function sectionErrorReason(error: Error) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Нет связи. Проверь интернет и нажми «Повторить».";
  if (isStaleBundle(error)) return "Приложение обновилось. Нажми «Повторить», чтобы открыть новую версию.";
  return "Раздел не открылся из-за ошибки в приложении. Попробуй ещё раз.";
}

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[portal] screen render failed", error);
  }, [error]);

  return (
    <AppErrorScreen
      title="Что-то пошло не так"
      reason={sectionErrorReason(error)}
      onRetry={() => (isStaleBundle(error) ? window.location.reload() : reset())}
    />
  );
}
