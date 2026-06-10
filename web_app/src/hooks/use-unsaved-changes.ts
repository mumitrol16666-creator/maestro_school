"use client";

import { useEffect } from "react";

const WARNING = "Есть несохранённые изменения. Покинуть страницу и потерять их?";

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function guardInternalNavigation(event: MouseEvent) {
      if (!isDirty || event.defaultPrevented || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link || link.target === "_blank" || link.download) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm(WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardInternalNavigation, true);
    };
  }, [isDirty]);
}
