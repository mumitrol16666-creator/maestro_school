/**
 * Stage 4: who may open which lesson of a course.
 *
 * - A course with no price (priceKzt null) is not for sale: it is open to everyone, as every course
 *   was before paid courses existed. A course becomes paid only when an administrator sets a price.
 * - In a paid course the first `freeLessonsCount` published lessons (through all modules, in the
 *   order students unlock them) are open to anyone; the rest need access.
 * - Access is one of: the course is included in school and the user is linked to CRM («school»),
 *   a current paid access («paid»), a current access the administrator gave («granted»).
 * - Staff who author courses preview any lesson without paying.
 *
 * Pure functions only; the service loads the data.
 */

export type CourseAccessKind = "school" | "paid" | "granted" | "none";
export type CourseAudience = "school" | "external";

export interface CourseSaleTerms {
  priceKzt: number | null;
  includedInSchool: boolean;
  freeLessonsCount: number;
}

export interface CourseAccessGrant {
  source: "payment" | "admin_grant";
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ResolvedCourseAccess {
  kind: CourseAccessKind;
  /** End of the access period for paid and granted access; school access has none. */
  expiresAt: Date | null;
}

/** A course is for sale only while it has a positive price. */
export function courseIsForSale(course: Pick<CourseSaleTerms, "priceKzt">): boolean {
  return typeof course.priceKzt === "number" && course.priceKzt > 0;
}

/** Not revoked, started, and not yet expired: startsAt <= now < expiresAt. */
export function accessGrantIsCurrent(grant: CourseAccessGrant, now: Date): boolean {
  if (grant.revokedAt) return false;
  return grant.startsAt.getTime() <= now.getTime() && now.getTime() < grant.expiresAt.getTime();
}

/**
 * The first `freeLessonsCount` published lessons of the course. `orderedLessonIds` lists the
 * published lessons through all modules in unlock order.
 */
export function lessonIsFree(
  orderedLessonIds: readonly string[],
  lessonId: string,
  freeLessonsCount: number,
): boolean {
  const index = orderedLessonIds.indexOf(lessonId);
  return index >= 0 && index < Math.max(0, freeLessonsCount);
}

export function resolveCourseAccess(input: {
  course: CourseSaleTerms;
  /** The user has a CRM student id, i.e. is a student of the school. */
  linkedToSchool: boolean;
  grants: readonly CourseAccessGrant[];
  now: Date;
}): ResolvedCourseAccess {
  if (input.course.includedInSchool && input.linkedToSchool) {
    return { kind: "school", expiresAt: null };
  }
  const current = input.grants
    .filter((grant) => accessGrantIsCurrent(grant, input.now))
    .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
  if (!current) return { kind: "none", expiresAt: null };
  return { kind: current.source === "payment" ? "paid" : "granted", expiresAt: current.expiresAt };
}

/** Teachers, school administrators and anyone who manages the catalog open any lesson to preview it. */
export function canPreviewCourses(user: { roleSlug: string; permissions: readonly string[] }): boolean {
  return ["teacher", "admin", "owner", "super_admin", "branch_manager"].includes(user.roleSlug)
    || user.permissions.includes("catalog.manage");
}

export function canOpenLesson(input: {
  course: CourseSaleTerms;
  access: ResolvedCourseAccess;
  preview: boolean;
  orderedLessonIds: readonly string[];
  lessonId: string;
}): boolean {
  if (input.preview) return true;
  if (!courseIsForSale(input.course)) return true;
  if (input.access.kind !== "none") return true;
  return lessonIsFree(input.orderedLessonIds, input.lessonId, input.course.freeLessonsCount);
}

/**
 * Which app a person belongs to. Only a student account without a CRM link is external; staff and
 * parents work in the school interface, so they are «school».
 */
export function resolveAudience(user: { roleSlug: string; crmStudentId: string | null }): CourseAudience {
  return user.roleSlug === "student" && !user.crmStudentId ? "external" : "school";
}
