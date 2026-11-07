"use client";

import { orderOpenSectors, sectorSwitchLabel, type OpenSectorLike } from "@/lib/sector-switch";

/**
 * 07.11: shown only when a direction has two open sectors — the current one and the previous
 * one waiting for its exam. With one sector there is nothing to switch.
 */
export function SectorSwitch({
  sectors,
  selectedId,
  onSelect,
  audience = "other",
  label = "Сектор направления",
  suffixes,
  className = "",
}: {
  sectors: readonly OpenSectorLike[];
  selectedId: string | null | undefined;
  onSelect: (id: string) => void;
  audience?: "student" | "other";
  label?: string;
  /** Text after a tab's label by sector id, e.g. «· 2 изменения». */
  suffixes?: Record<string, string | undefined>;
  className?: string;
}) {
  if (sectors.length < 2) return null;
  const ordered = orderOpenSectors(sectors);
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid="sector-switch"
      className={`grid min-w-0 gap-1 rounded-xl bg-stone-100 p-1 min-[420px]:grid-cols-2 ${className}`}
    >
      {ordered.map((sector) => {
        const selected = sector.id === selectedId;
        return (
          <button
            key={sector.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-sector-id={sector.id}
            onClick={() => onSelect(sector.id)}
            className={`min-h-11 min-w-0 rounded-lg px-3 py-2 text-center text-sm font-bold leading-5 transition ${
              selected ? "bg-white text-ink shadow-xs" : "text-stone-600 hover:text-ink"
            }`}
          >
            {sectorSwitchLabel(sector, audience)}{suffixes?.[sector.id] ? ` · ${suffixes[sector.id]}` : ""}
          </button>
        );
      })}
    </div>
  );
}
