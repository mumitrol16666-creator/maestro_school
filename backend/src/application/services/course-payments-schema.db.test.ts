import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Stage 4: what the database itself guarantees about course money — one waiting «Я оплатил» per
 * student and course, positive amounts, one access per confirmed request, one payment-details row.
 */
integrationTest("the database keeps one pending payment request per student and course, positive amounts and one access per request", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const user = (index: number) => prisma.user.create({ data: {
    login: `pay_schema_${index}_${suffix}`, phone: `+7700${index}${suffix.replace(/\D/g, "").padEnd(6, "1").slice(0, 6)}`,
    passwordHash: "x", firstName: "Оплата", lastName: suffix, roleId: role.id,
  } });
  const first = await user(1);
  const second = await user(2);
  const direction = await prisma.direction.create({ data: { title: `Оплата ${suffix}`, slug: `pay-schema-${suffix}`, isPublished: true } });
  const course = await prisma.course.create({ data: { directionId: direction.id, title: `Курс ${suffix}`, isPublished: true, priceKzt: 12000 } });
  const otherCourse = await prisma.course.create({ data: { directionId: direction.id, title: `Другой ${suffix}`, isPublished: true } });
  t.after(async () => {
    await prisma.courseAccess.deleteMany({ where: { courseId: { in: [course.id, otherCourse.id] } } });
    await prisma.coursePaymentRequest.deleteMany({ where: { courseId: { in: [course.id, otherCourse.id] } } });
    await prisma.course.deleteMany({ where: { directionId: direction.id } });
    await prisma.direction.delete({ where: { id: direction.id } });
    await prisma.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    await prisma.$disconnect();
  });

  const request = (studentId: string, courseId: string, overrides: Record<string, unknown> = {}) => prisma.coursePaymentRequest.create({
    data: { courseId, studentId, payerUserId: studentId, amountKzt: 12000, ...overrides },
  });
  const rejects = async (action: Promise<unknown>, pattern: RegExp, message: string) => {
    await assert.rejects(action, (error: Error) => pattern.test(error.message), message);
  };

  const pending = await request(first.id, course.id);
  assert.equal(pending.status, "pending");
  await rejects(request(first.id, course.id), /Unique constraint|unique/i, "a second pending request for the same student and course is refused");
  await request(first.id, otherCourse.id);
  await request(second.id, course.id);

  await prisma.coursePaymentRequest.update({ where: { id: pending.id }, data: { status: "rejected", decidedAt: new Date() } });
  const again = await request(first.id, course.id);
  assert.equal(again.status, "pending", "after a rejection the student may ask again");
  const confirmed = await request(second.id, otherCourse.id, { status: "confirmed" });
  assert.equal(confirmed.status, "confirmed", "confirmed requests do not count against the pending index");
  await request(second.id, otherCourse.id, { status: "confirmed" });

  await rejects(request(first.id, otherCourse.id, { status: "rejected", amountKzt: 0 }), /check|constraint/i, "an amount of zero is refused");
  await rejects(request(first.id, otherCourse.id, { status: "rejected", amountKzt: -5 }), /check|constraint/i, "a negative amount is refused");
  await rejects(prisma.course.update({ where: { id: course.id }, data: { priceKzt: 0 } }), /check|constraint/i, "a price of zero is refused");

  await rejects(
    prisma.coursePaymentRequest.update({ where: { id: again.id }, data: { refundedAt: new Date() } }),
    /check|constraint/i,
    "a refund mark on a request that was never confirmed is refused",
  );
  await prisma.coursePaymentRequest.update({ where: { id: confirmed.id }, data: { refundedAt: new Date() } });

  const period = { startsAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) };
  await prisma.courseAccess.create({ data: { studentId: second.id, courseId: otherCourse.id, source: "payment", paymentRequestId: confirmed.id, ...period } });
  await rejects(
    prisma.courseAccess.create({ data: { studentId: second.id, courseId: otherCourse.id, source: "payment", paymentRequestId: confirmed.id, ...period } }),
    /Unique constraint|unique/i,
    "one confirmed request opens one access",
  );
  await prisma.courseAccess.create({ data: { studentId: second.id, courseId: otherCourse.id, source: "admin_grant", ...period } });
  await rejects(
    prisma.courseAccess.create({ data: { studentId: second.id, courseId: course.id, source: "admin_grant", startsAt: period.expiresAt, expiresAt: period.startsAt } }),
    /check|constraint/i,
    "an access must end after it starts",
  );

  const settings = await prisma.coursePaymentSettings.findMany();
  assert.equal(settings.length, 1);
  assert.equal(settings[0].id, 1);
  await rejects(prisma.coursePaymentSettings.create({ data: { id: 2 } }), /check|constraint/i, "payment details stay one row");
  const defaults = await prisma.course.findUniqueOrThrow({ where: { id: otherCourse.id } });
  assert.deepEqual([defaults.priceKzt, defaults.includedInSchool, defaults.freeLessonsCount], [null, false, 2]);
  assert.ok(await prisma.permission.findUnique({ where: { code: "course_payments.manage" } }), "the payment permission exists");
});
