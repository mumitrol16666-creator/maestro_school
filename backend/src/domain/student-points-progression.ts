import { getProductLevel } from "./product-economy-v2.js";
import { getStudentRank } from "./student-rank.js";

/** Historical rank and current LEVEL are mutually exclusive presentations. */
export function studentPointsProgression(mode: "legacy" | "level", points: number) {
  return mode === "level"
    ? { rank: null, level: getProductLevel(points) }
    : { rank: getStudentRank(points), level: null };
}
