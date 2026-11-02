import { prisma } from "../../infrastructure/database/prisma.js";
import { CoursePaymentRequiredError, NotFoundError } from "../../domain/errors.js";
import {
  canOpenLesson,
  canPreviewCourses,
  courseIsForSale,
  resolveCourseAccess,
  type CourseAccessGrant,
  type CourseAccessKind,
  type CourseSaleTerms,
} from "../../domain/course-access.js";
import { getOrderedPublishedLessons } from "../repositories/learning.repository.js";

/**
 * Stage 4: access of a person to the lessons of a paid course. The checks read the current state
 * every time: a period that ended or a refund closes the lessons without any job running.
 */

export interface CourseAccessState {
  courseId: string;
  /** The course has a positive price. A course that is not for sale is open to everyone. */
  forSale: boolean;
  priceKzt: number | null;
  includedInSchool: boolean;
  freeLessonsCount: number;
  /** How the person holds the course: school, paid, granted or none. A free course is «none» but fully open. */
  kind: CourseAccessKind;
  /** End of the paid or granted period. */
  expiresAt: Date | null;
  /** Staff opening any lesson to preview it. */
  preview: boolean;
  /** Every lesson is open: the course is free, the person holds access, or previews. */
  fullAccess: boolean;
  /** «Я оплатил» waiting for the administrator. */
  pendingPaymentRequest: { id: string; createdAt: Date } | null;
}

/** What the client needs to draw a course card or a paywall. */
export function courseAccessDto(state: CourseAccessState) {
  return {
    forSale: state.forSale,
    kind: state.kind,
    expiresAt: state.expiresAt,
    fullAccess: state.fullAccess,
    preview: state.preview,
    pendingPaymentRequest: state.pendingPaymentRequest,
  };
}

export const courseSaleTermsSelect = {
  id: true,
  priceKzt: true,
  includedInSchool: true,
  freeLessonsCount: true,
} as const;

interface AccessActor {
  linkedToSchool: boolean;
  preview: boolean;
}

async function loadAccessActor(userId: string): Promise<AccessActor> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      crmStudentId: true,
      role: { select: { slug: true, rolePermissions: { select: { permission: { select: { code: true } } } } } },
    },
  });
  if (!user) return { linkedToSchool: false, preview: false };
  return {
    linkedToSchool: Boolean(user.crmStudentId),
    preview: canPreviewCourses({
      roleSlug: user.role.slug,
      permissions: user.role.rolePermissions.map((item) => item.permission.code),
    }),
  };
}

function stateFor(
  course: CourseSaleTerms & { id: string },
  actor: AccessActor,
  grants: CourseAccessGrant[],
  pending: { id: string; createdAt: Date } | null,
  now: Date,
): CourseAccessState {
  const access = resolveCourseAccess({ course, linkedToSchool: actor.linkedToSchool, grants, now });
  const forSale = courseIsForSale(course);
  return {
    courseId: course.id,
    forSale,
    priceKzt: course.priceKzt,
    includedInSchool: course.includedInSchool,
    freeLessonsCount: course.freeLessonsCount,
    kind: access.kind,
    expiresAt: access.expiresAt,
    preview: actor.preview,
    fullAccess: actor.preview || !forSale || access.kind !== "none",
    pendingPaymentRequest: pending,
  };
}

/** Access state of one person for several courses at once (the catalog). A guest holds nothing. */
export async function getCourseAccessStates(
  userId: string | null | undefined,
  courses: Array<CourseSaleTerms & { id: string }>,
  now = new Date(),
): Promise<Map<string, CourseAccessState>> {
  const result = new Map<string, CourseAccessState>();
  const actor: AccessActor = userId ? await loadAccessActor(userId) : { linkedToSchool: false, preview: false };
  const courseIds = courses.map((course) => course.id);
  const [accessRows, pendingRows] = userId && courseIds.length
    ? await Promise.all([
      prisma.courseAccess.findMany({
        where: { studentId: userId, courseId: { in: courseIds } },
        select: { courseId: true, source: true, startsAt: true, expiresAt: true, revokedAt: true },
      }),
      prisma.coursePaymentRequest.findMany({
        where: { studentId: userId, courseId: { in: courseIds }, status: "pending" },
        select: { id: true, courseId: true, createdAt: true },
      }),
    ])
    : [[], []];

  for (const course of courses) {
    const grants = accessRows.filter((row) => row.courseId === course.id);
    const pending = pendingRows.find((row) => row.courseId === course.id);
    result.set(course.id, stateFor(
      course,
      actor,
      grants,
      pending ? { id: pending.id, createdAt: pending.createdAt } : null,
      now,
    ));
  }
  return result;
}

export async function getCourseAccessState(
  userId: string | null | undefined,
  courseId: string,
  now = new Date(),
): Promise<CourseAccessState> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: courseSaleTermsSelect,
  });
  if (!course) throw new NotFoundError("Course");
  const states = await getCourseAccessStates(userId, [course], now);
  return states.get(course.id)!;
}

export interface LessonAccess {
  lessonId: string;
  courseId: string;
  open: boolean;
  state: CourseAccessState;
}

/** Whether the person may open one lesson, with the course state the paywall needs. */
export async function getLessonAccess(userId: string, lessonId: string, now = new Date()): Promise<LessonAccess> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, isPublished: true },
    select: { id: true, module: { select: { courseId: true, course: { select: courseSaleTermsSelect } } } },
  });
  if (!lesson) throw new NotFoundError("Lesson");
  const course = lesson.module.course;
  if (!courseIsForSale(course)) {
    // Not for sale: open to everyone, nothing else to look up.
    const state = stateFor(course, { linkedToSchool: false, preview: false }, [], null, now);
    return { lessonId, courseId: course.id, open: true, state };
  }
  const states = await getCourseAccessStates(userId, [course], now);
  const state = states.get(course.id)!;

  // A course that is open to everyone, or a person who holds it, needs no look at the lesson order.
  if (state.fullAccess) return { lessonId, courseId: course.id, open: true, state };

  const ordered = await getOrderedPublishedLessons(course.id);
  const open = canOpenLesson({
    course,
    access: { kind: state.kind, expiresAt: state.expiresAt },
    preview: state.preview,
    orderedLessonIds: ordered.map((item) => item.id),
    lessonId,
  });
  return { lessonId, courseId: course.id, open, state };
}

/** 403 COURSE_PAYMENT_REQUIRED when the lesson is paid and the person holds no access. */
export async function requireLessonAccess(userId: string, lessonId: string, now = new Date()): Promise<LessonAccess> {
  const access = await getLessonAccess(userId, lessonId, now);
  if (!access.open) throw new CoursePaymentRequiredError(access.courseId);
  return access;
}

/**
 * For lists that carry lessons of many courses: ids of lessons the person may not open, from the
 * lessons in unlock order per course.
 */
export async function findLockedLessonIds(
  userId: string,
  courses: Array<{ course: CourseSaleTerms & { id: string }; orderedLessonIds: string[] }>,
  now = new Date(),
): Promise<Set<string>> {
  const locked = new Set<string>();
  const paid = courses.filter((item) => courseIsForSale(item.course));
  if (!paid.length) return locked;
  const states = await getCourseAccessStates(userId, paid.map((item) => item.course), now);
  for (const { course, orderedLessonIds } of paid) {
    const state = states.get(course.id)!;
    if (state.fullAccess) continue;
    for (const lessonId of orderedLessonIds) {
      const open = canOpenLesson({
        course,
        access: { kind: state.kind, expiresAt: state.expiresAt },
        preview: state.preview,
        orderedLessonIds,
        lessonId,
      });
      if (!open) locked.add(lessonId);
    }
  }
  return locked;
}
