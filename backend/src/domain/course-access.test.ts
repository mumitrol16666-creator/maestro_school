import assert from "node:assert/strict";
import test from "node:test";
import {
  accessGrantIsCurrent,
  canOpenLesson,
  canPreviewCourses,
  courseIsForSale,
  lessonIsFree,
  resolveAudience,
  resolveCourseAccess,
  type CourseAccessGrant,
  type CourseSaleTerms,
} from "./course-access.js";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const lessons = ["l1", "l2", "l3", "l4"];

const paidCourse: CourseSaleTerms = { priceKzt: 15000, includedInSchool: false, freeLessonsCount: 2 };
const schoolCourse: CourseSaleTerms = { priceKzt: 15000, includedInSchool: true, freeLessonsCount: 2 };
const freeCourse: CourseSaleTerms = { priceKzt: null, includedInSchool: false, freeLessonsCount: 2 };

function grant(overrides: Partial<CourseAccessGrant> = {}): CourseAccessGrant {
  return { source: "payment", startsAt: day(-1), expiresAt: day(180), revokedAt: null, ...overrides };
}

function open(course: CourseSaleTerms, grants: CourseAccessGrant[], lessonId: string, options: { linked?: boolean; preview?: boolean } = {}) {
  const access = resolveCourseAccess({ course, linkedToSchool: options.linked ?? false, grants, now: NOW });
  return canOpenLesson({ course, access, preview: options.preview ?? false, orderedLessonIds: lessons, lessonId });
}

test("a course is for sale only with a positive price", () => {
  assert.equal(courseIsForSale({ priceKzt: 15000 }), true);
  assert.equal(courseIsForSale({ priceKzt: null }), false);
  assert.equal(courseIsForSale({ priceKzt: 0 }), false);
});

test("the first freeLessonsCount lessons are free: lesson 2 is, lesson 3 is not", () => {
  assert.equal(lessonIsFree(lessons, "l1", 2), true);
  assert.equal(lessonIsFree(lessons, "l2", 2), true);
  assert.equal(lessonIsFree(lessons, "l3", 2), false);
  assert.equal(lessonIsFree(lessons, "l1", 0), false, "zero free lessons closes the whole course");
  assert.equal(lessonIsFree(lessons, "l4", 99), true);
  assert.equal(lessonIsFree(lessons, "unknown", 2), false, "an unpublished or foreign lesson is never free");
});

test("a paid course without access opens lessons 1 and 2 and closes 3 and 4", () => {
  assert.equal(open(paidCourse, [], "l1"), true);
  assert.equal(open(paidCourse, [], "l2"), true);
  assert.equal(open(paidCourse, [], "l3"), false);
  assert.equal(open(paidCourse, [], "l4"), false);
});

test("a paid access opens every lesson", () => {
  assert.equal(open(paidCourse, [grant()], "l3"), true);
  assert.equal(open(paidCourse, [grant()], "l4"), true);
  const access = resolveCourseAccess({ course: paidCourse, linkedToSchool: false, grants: [grant()], now: NOW });
  assert.equal(access.kind, "paid");
  assert.deepEqual(access.expiresAt, day(180));
});

test("an access the administrator gave is «granted», not «paid»", () => {
  const access = resolveCourseAccess({
    course: paidCourse, linkedToSchool: false, grants: [grant({ source: "admin_grant" })], now: NOW,
  });
  assert.equal(access.kind, "granted");
  assert.equal(open(paidCourse, [grant({ source: "admin_grant" })], "l3"), true);
});

test("an access closes exactly at expiresAt and opens exactly at startsAt", () => {
  assert.equal(accessGrantIsCurrent(grant({ expiresAt: NOW }), NOW), false, "now == expiresAt is already closed");
  assert.equal(accessGrantIsCurrent(grant({ expiresAt: new Date(NOW.getTime() + 1) }), NOW), true);
  assert.equal(accessGrantIsCurrent(grant({ startsAt: NOW }), NOW), true, "now == startsAt is open");
  assert.equal(accessGrantIsCurrent(grant({ startsAt: new Date(NOW.getTime() + 1) }), NOW), false);
});

test("an expired access closes lesson 3 but the free lessons stay open", () => {
  const expired = grant({ startsAt: day(-200), expiresAt: day(-1) });
  assert.equal(open(paidCourse, [expired], "l3"), false);
  assert.equal(open(paidCourse, [expired], "l2"), true);
  assert.equal(resolveCourseAccess({ course: paidCourse, linkedToSchool: false, grants: [expired], now: NOW }).kind, "none");
});

test("a revoked access closes lesson 3 even before it expires", () => {
  const revoked = grant({ revokedAt: day(-2) });
  assert.equal(open(paidCourse, [revoked], "l3"), false);
  assert.equal(resolveCourseAccess({ course: paidCourse, linkedToSchool: false, grants: [revoked], now: NOW }).kind, "none");
});

test("with an expired one and a current one, the current one counts", () => {
  const grants = [grant({ startsAt: day(-400), expiresAt: day(-30) }), grant({ source: "admin_grant", expiresAt: day(60) })];
  const access = resolveCourseAccess({ course: paidCourse, linkedToSchool: false, grants, now: NOW });
  assert.equal(access.kind, "granted");
  assert.deepEqual(access.expiresAt, day(60));
});

test("a course with no price is open to everyone, whoever they are", () => {
  for (const lessonId of lessons) {
    assert.equal(open(freeCourse, [], lessonId), true, `external, ${lessonId}`);
    assert.equal(open(freeCourse, [], lessonId, { linked: true }), true, `school, ${lessonId}`);
  }
});

test("a course included in school is free for a school student and paid for an external one", () => {
  const school = resolveCourseAccess({ course: schoolCourse, linkedToSchool: true, grants: [], now: NOW });
  assert.equal(school.kind, "school");
  assert.equal(school.expiresAt, null);
  assert.equal(open(schoolCourse, [], "l4", { linked: true }), true);
  assert.equal(open(schoolCourse, [], "l3", { linked: false }), false, "no CRM link, no school access");
  assert.equal(open(schoolCourse, [], "l2", { linked: false }), true, "free lessons stay free");
});

test("a school student on a course without the flag is treated like an external one", () => {
  assert.equal(resolveCourseAccess({ course: paidCourse, linkedToSchool: true, grants: [], now: NOW }).kind, "none");
  assert.equal(open(paidCourse, [], "l3", { linked: true }), false);
  assert.equal(open(paidCourse, [grant()], "l3", { linked: true }), true, "but a paid access works for them too");
});

test("school access wins over a paid access", () => {
  assert.equal(resolveCourseAccess({ course: schoolCourse, linkedToSchool: true, grants: [grant()], now: NOW }).kind, "school");
});

test("staff preview any lesson without paying", () => {
  assert.equal(open(paidCourse, [], "l4", { preview: true }), true);
  assert.equal(canPreviewCourses({ roleSlug: "teacher", permissions: [] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "admin", permissions: [] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "owner", permissions: [] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "super_admin", permissions: [] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "branch_manager", permissions: [] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "curator", permissions: ["catalog.manage"] }), true);
  assert.equal(canPreviewCourses({ roleSlug: "curator", permissions: ["homework.review"] }), false);
  assert.equal(canPreviewCourses({ roleSlug: "student", permissions: ["lessons.read"] }), false);
  assert.equal(canPreviewCourses({ roleSlug: "parent", permissions: ["family.read"] }), false);
});

test("audience: only a student without a CRM link is external", () => {
  assert.equal(resolveAudience({ roleSlug: "student", crmStudentId: null }), "external");
  assert.equal(resolveAudience({ roleSlug: "student", crmStudentId: "crm-1" }), "school");
  assert.equal(resolveAudience({ roleSlug: "teacher", crmStudentId: null }), "school");
  assert.equal(resolveAudience({ roleSlug: "admin", crmStudentId: null }), "school");
  assert.equal(resolveAudience({ roleSlug: "parent", crmStudentId: null }), "school");
});
