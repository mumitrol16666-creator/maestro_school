/**
 * Plan 1.13: two lines of sectors that never mix — the student's own and the group's.
 * The student reads «Мой сектор N»; a parent and a teacher read «Сектор N».
 */
export function sectorTitle(
  plan: { scope: "student" | "group"; sequence?: number | null },
  audience: "student" | "other" = "other",
) {
  const number = plan.sequence ? ` ${plan.sequence}` : "";
  if (plan.scope === "group") return `Сектор группы${number}`;
  return audience === "student" ? `Мой сектор${number}` : `Сектор${number}`;
}
