"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveSelectedSector, type OpenSectorLike } from "@/lib/sector-switch";

/**
 * Which of a direction's open sectors a screen shows (07.11). The choice lives in the screen
 * and in `?sector=<planId>`; nothing is stored. The query is read after mount so the first
 * render is the same on the server and in the browser.
 */
export function useSectorChoice() {
  const [fromUrl, setFromUrl] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});

  useEffect(() => {
    setFromUrl(new URLSearchParams(window.location.search).get("sector"));
  }, []);

  const select = useCallback((directionKey: string, planId: string) => {
    setChosen((current) => ({ ...current, [directionKey]: planId }));
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("sector", planId);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The choice still works without the address bar.
    }
  }, []);

  const pick = useCallback(<T extends OpenSectorLike>(directionKey: string, sectors: readonly T[]) => (
    resolveSelectedSector(sectors, chosen[directionKey] ?? fromUrl)
  ), [chosen, fromUrl]);

  return { pick, select };
}
