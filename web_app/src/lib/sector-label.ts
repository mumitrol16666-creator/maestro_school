/**
 * Plan 1.13: two lines of sectors that never mix — the student's own and the group's.
 * The student reads «Мой сектор N»; a parent and a teacher read «Сектор N».
 */
export function sectorTitle(
  plan: { scope: "student" | "group"; sequence?: number | null },
  audience: "student" | "other" = "other",
) {
  const number = plan.sequence ? ` ${plan.sequence}` : "";
  if (plan.scope === "group") return `План группы${number}`;
  return audience === "student" ? `Мой сектор${number}` : `Сектор${number}`;
}

/**
 * The same name of a sector wherever a topic is picked or listed: «Сектор 2 · тема»,
 * and «Сектор 1 · ждёт экзамена · тема» for the sector waiting for its exam.
 */
export function sectorTopicLabel(
  plan: { scope?: "student" | "group" | null; sequence?: number | null; status?: string | null },
  title: string,
) {
  const sector = sectorTitle({ scope: plan.scope ?? "student", sequence: plan.sequence });
  return `${sector}${plan.status === "awaiting_exam" ? " · ждёт экзамена" : ""} · ${title}`;
}
