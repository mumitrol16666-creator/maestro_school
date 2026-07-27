import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyOfflineSummary } from "./family-view.js";

test("family summary exposes learning results without private student fields or materials", () => {
  const result = buildFamilyOfflineSummary({
    crmStudentId: "crm-secret",
    appUserId: "internal-user-id",
    profile: {
      name: "Ученик",
      phone: "77000000000",
      groups: [{ name: "Гитара" }],
    },
    balanceSnapshot: { classesRemainingTotal: 4 },
    upcomingLessons: [{
      crmClassId: "class-1",
      title: "Гитара",
      materials: [{ url: "https://private.example/material.pdf" }],
    }],
    lessonHistory: [{
      crmClassId: "class-0",
      homework: "Повторить аккорды",
      lessonSummary: "Получилось уверенно",
      materials: [{ url: "https://private.example/video.mp4" }],
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
  assert.equal("materials" in result.lessonHistory[0], false);
  assert.equal(result.lessonHistory[0].homework, "Повторить аккорды");
  assert.equal(result.lessonHistory[0].lessonSummary, "Получилось уверенно");
});
