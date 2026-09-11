import { createHash } from "node:crypto";

export const ASSIGNED_CRM_DIRECTION_PREFIX = "assigned-direction-";
export const ASSIGNED_CRM_DIRECTION_UPDATED_AT = "1970-01-01T00:00:00.000Z";

export function normalizeCrmDirectionTitle(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru");
}

export function crmDirectionTitlesMatch(left: string, right: string) {
  return normalizeCrmDirectionTitle(left) === normalizeCrmDirectionTitle(right);
}

export function assignedCrmDirectionId(title: string) {
  const digest = createHash("sha256")
    .update(normalizeCrmDirectionTitle(title))
    .digest("hex")
    .slice(0, 24);
  return `${ASSIGNED_CRM_DIRECTION_PREFIX}${digest}`;
}

export function isAssignedCrmDirectionId(value: string | null | undefined) {
  return Boolean(value?.startsWith(ASSIGNED_CRM_DIRECTION_PREFIX));
}

type DirectionRef = {
  crmDirectionId: string;
  title: string;
  isActive: boolean;
  updatedAt: string;
};

export function mergeAssignedCrmDirections<T extends DirectionRef>(
  catalogDirections: readonly T[],
  assignedTitles: readonly string[],
): DirectionRef[] {
  const activeCatalogByTitle = new Map<string, T>();
  for (const direction of catalogDirections) {
    if (!direction.isActive) continue;
    const normalizedTitle = normalizeCrmDirectionTitle(direction.title);
    if (normalizedTitle && !activeCatalogByTitle.has(normalizedTitle)) {
      activeCatalogByTitle.set(normalizedTitle, direction);
    }
  }

  const result: DirectionRef[] = [];
  const seenTitles = new Set<string>();
  for (const rawTitle of assignedTitles) {
    const title = rawTitle.normalize("NFKC").replace(/[\u00a0\u2007\u202f]/g, " ").replace(/\s+/g, " ").trim();
    const normalizedTitle = normalizeCrmDirectionTitle(title);
    if (!normalizedTitle || seenTitles.has(normalizedTitle)) continue;
    seenTitles.add(normalizedTitle);
    result.push(activeCatalogByTitle.get(normalizedTitle) ?? {
      crmDirectionId: assignedCrmDirectionId(title),
      title,
      isActive: true,
      updatedAt: ASSIGNED_CRM_DIRECTION_UPDATED_AT,
    });
  }
  return result;
}
