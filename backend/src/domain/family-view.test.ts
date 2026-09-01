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
    monthlyPlan: null,
  });

  assert.deepEqual(result.profile, {
    name: "Ученик",
    groups: [{ name: "Гитара" }],
  });
  assert.equal("phone" in result.profile, false);
  assert.equal("crmStudentId" in result, false);
  assert.equal("appUserId" in result, false);
  assert.equal("materials" in result.upcomingLessons[0], false);
  assert.deepEqual(result.financialBalance, {
    signedAmountKzt: -4500,
    status: "debt",
    source: "crm",
  });
  assert.equal("lessonHistory" in result, false);
  assert.equal("balanceSnapshot" in result, false);
});

test("family summary removes modules disabled for all linked parents", () => {
  const result = buildFamilyOfflineSummary({
    profile: { name: "Ученик", groups: [] },
    balanceSnapshot: { debtAmountKzt: 0, accountBalanceKzt: 12000 },
    upcomingLessons: [{ crmClassId: "class-1", materials: [] }],
    monthlyPlan: { id: "plan-1" },
  }, {
    showSchedule: false,
    showBalance: false,
    showPlanProgress: false,
  });

  assert.equal(result.financialBalance, null);
  assert.deepEqual(result.upcomingLessons, []);
  assert.equal(result.monthlyPlan, null);
});
