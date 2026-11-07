/**
 * 07.11: a direction may have two open sectors — the current one (active) and the previous one
 * waiting for its exam (awaiting_exam). Which of them a screen shows is screen state, not data:
 * by default the current one; with none current, the one waiting.
 */
export type OpenSectorLike = { id: string; sequence?: number | null; status?: string | null };

export function isOpenSector(sector: OpenSectorLike) {
  return sector.status === "active" || sector.status === "awaiting_exam" || sector.status == null;
}

/** Current sector first, then the one waiting for its exam. */
export function orderOpenSectors<T extends OpenSectorLike>(sectors: readonly T[]): T[] {
  const rank = (sector: T) => (sector.status === "awaiting_exam" ? 1 : 0);
  return [...sectors].sort((left, right) => rank(left) - rank(right) || (right.sequence ?? 0) - (left.sequence ?? 0));
}

/** The requested sector if it is among the open ones; otherwise the current one, otherwise the waiting one. */
export function resolveSelectedSector<T extends OpenSectorLike>(sectors: readonly T[], requestedId?: string | null): T | null {
  const ordered = orderOpenSectors(sectors);
  return ordered.find((sector) => sector.id === requestedId) ?? ordered[0] ?? null;
}

export function sectorSwitchLabel(
  sector: OpenSectorLike,
  audience: "student" | "other" = "other",
) {
  const number = sector.sequence ? ` ${sector.sequence}` : "";
  const name = `${audience === "student" ? "Мой сектор" : "Сектор"}${number}`;
  return `${name} · ${sector.status === "awaiting_exam" ? "ждёт экзамена" : "текущий"}`;
}

/** Open sectors by direction: the student's own (at most two) and the group's plans apart. */
export function groupOpenSectorsByDirection<T extends OpenSectorLike & { scope: "student" | "group"; direction?: { id: string; title: string } | null }>(plans: readonly T[]) {
  const blocks = new Map<string, { key: string; title: string; personal: T[]; group: T[] }>();
  for (const plan of plans) {
    const key = plan.direction?.id ?? "no-direction";
    const block = blocks.get(key) ?? { key, title: plan.direction?.title ?? "", personal: [], group: [] };
    (plan.scope === "group" ? block.group : block.personal).push(plan);
    blocks.set(key, block);
  }
  return [...blocks.values()];
}
