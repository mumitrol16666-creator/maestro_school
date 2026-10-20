import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyOfflineSummary } from "./family-view.js";

test("family summary exposes only the configured parent skeleton", () => {
  const result = buildFamilyOfflineSummary({
    crmStudentId: "crm-secret",
    appUserId: "internal-user-id",
    profile: {
      name: "Ученик",
      phone: "77000000000",
      groups: [{ name: "Гитара" }],
    },
    balanceSnapshot: { debtAmountKzt: 4500, accountBalanceKzt: 0 },
    upcomingLessons: [{
      crmClassId: "class-1",
      title: "Гитара",
      materials: [{ url: "https://private.example/material.pdf" }],
    }],
  });

  assert.deepEqual(result.profile, {
    name: "Ученик",
    groups: [{ name: "Гитара" }],
  });
  assert.equal("phone" in result.profile, false);
  assert.equal("crmStudentId" in result, false);
  assert.equal("appUserId" in result, false);
  assert.equal("materials" in result.upcomingLessons[0]!, false);
  assert.deepEqual(result.financialBalance, {
    signedAmountKzt: -4500,
    status: "debt",
    source: "crm",
    amountDueKzt: 4500,
    membership: null,
    otherMemberships: [],
  });
  assert.deepEqual(result.visits, []);
  assert.equal("lessonHistory" in result, false);
  assert.equal("balanceSnapshot" in result, false);
});

test("family summary removes modules disabled for all linked parents", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: { debtAmountKzt: 0, accountBalanceKzt: 12000 },
    upcomingLessons: [{ crmClassId: "class-1", materials: [] }],
  }, {
    showSchedule: false,
    showBalance: false,
    showPlanProgress: false,
  });

  assert.equal(result.financialBalance, null);
  assert.deepEqual(result.upcomingLessons, []);
  assert.deepEqual(result.visits, []);
});

test("family balance shows the CRM amount due even when the account balance is not negative", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: { debtAmountKzt: 0, amountDueKzt: 9000, accountBalanceKzt: 1500 },
    upcomingLessons: [],
  });
  assert.deepEqual(
    { signedAmountKzt: result.financialBalance?.signedAmountKzt, status: result.financialBalance?.status, amountDueKzt: result.financialBalance?.amountDueKzt },
    { signedAmountKzt: -9000, status: "debt", amountDueKzt: 9000 },
  );
});

test("family balance falls back to the balance-only debt for an older CRM payload", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: { debtAmountKzt: 0, accountBalanceKzt: 2500 },
    upcomingLessons: [],
  });
  assert.equal(result.financialBalance?.signedAmountKzt, 2500);
  assert.equal(result.financialBalance?.status, "credit");
});

test("plan 3.1: the parent sees the membership — lessons left, until when, what to pay — and nothing of prices", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: {
      amountDueKzt: 12000,
      accountBalanceKzt: 0,
      currentMembership: {
        crmMembershipId: "m1", billingModel: "package", planName: "Гитара 8 занятий", directionName: "Гитара",
        classesRemaining: 3, totalClasses: 8, endDate: "2026-11-30", remainingAmountKzt: 12000,
        totalPriceKzt: 40000, paidAmountKzt: 28000, individualLessonPrice: 5000,
      } as never,
      memberships: [
        { crmMembershipId: "m1" },
        { crmMembershipId: "m2", billingModel: "rate_card", type: "rate_card", classesRemaining: null, remainingAmountKzt: 0 },
      ],
    },
    upcomingLessons: [],
  });
  assert.deepEqual(result.financialBalance?.membership, {
    id: "m1", title: "Гитара 8 занятий", directionName: "Гитара", groupName: null, perLesson: false,
    classesRemaining: 3, totalClasses: 8, validUntil: "2026-11-30", amountToPayKzt: 12000,
  });
  assert.equal(result.financialBalance?.otherMemberships.length, 1);
  assert.equal(result.financialBalance?.otherMemberships[0]?.perLesson, true);
  assert.equal(JSON.stringify(result).includes("40000"), false, "no prices or payments");
  assert.equal(JSON.stringify(result).includes("28000"), false);
});

test("plan 3.2: once the school confirmed a lesson, visits show attendance, topic and summary — never homework", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: {},
    upcomingLessons: [],
    lessonHistory: [
      { crmClassId: "c1", date: "2026-10-18", status: "completed", attendanceStatus: "late", topic: "Бой", lessonSummary: "Разобрали бой", homework: "Повторить", isPast: true } as never,
      { crmClassId: "c2", date: "2026-10-16", status: "pending_admin_review", attended: true, topic: "Скрыто", lessonSummary: "Скрыто", isPast: true } as never,
      { crmClassId: "c3", date: "2026-10-14", status: "completed", attendanceStatus: "unexcused_absence", isPast: true },
      { crmClassId: "c4", date: "2026-10-12", status: "completed", attendanceStatus: "excused_absence", isPast: true },
    ],
  });
  assert.deepEqual(result.visits.map((visit) => [visit.crmClassId, visit.attendance, visit.topic]), [
    ["c1", "late", "Бой"],
    ["c2", "pending", null],
    ["c3", "absent", null],
    ["c4", "excused", null],
  ]);
  assert.equal(result.visits[0]?.summary, "Разобрали бой");
  assert.equal(JSON.stringify(result.visits).includes("Повторить"), false, "homework stays with the student");
});

test("an upcoming lesson carries only when, where and with whom — no homework or notes", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: {},
    upcomingLessons: [{ crmClassId: "c9", title: "Гитара", startTime: "10:00", homework: "x", homeworkReview: { status: "x" }, lessonSummary: "x", nextLessonFocus: "x" }],
  });
  assert.deepEqual(Object.keys(result.upcomingLessons[0]!).sort(), [
    "classType", "crmClassId", "date", "deliveryFormat", "endTime", "groupName", "meetingUrl", "roomName", "startTime", "status", "teacherName", "title",
  ]);
});
