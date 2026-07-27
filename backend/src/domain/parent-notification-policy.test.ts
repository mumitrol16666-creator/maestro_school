import assert from "node:assert/strict";
import test from "node:test";
import {
  parentBalanceAlert,
  parentOfflineEventType,
  shouldNotifyParentForOfflineEvent,
} from "./parent-notification-policy.js";

test("parent receives family events but not internal report corrections", () => {
  assert.equal(shouldNotifyParentForOfflineEvent("approved"), true);
  assert.equal(shouldNotifyParentForOfflineEvent("cancelled"), true);
  assert.equal(shouldNotifyParentForOfflineEvent("rescheduled"), true);
  assert.equal(shouldNotifyParentForOfflineEvent("returned"), false);
});

test("an absence gets a dedicated parent notification type", () => {
  assert.equal(parentOfflineEventType("approved", true), "parent_lesson_report_ready");
  assert.equal(parentOfflineEventType("approved", false), "parent_absence_alert");
  assert.equal(parentOfflineEventType("rescheduled"), "parent_schedule_changed");
  assert.equal(parentOfflineEventType("cancelled"), "parent_lesson_cancelled");
});

test("balance alert prioritizes debt and warns at one remaining class", () => {
  assert.deepEqual(
    parentBalanceAlert({ classesRemainingTotal: 0, debtAmountKzt: 4500 }),
    {
      kind: "debt",
      value: 4500,
      title: "Есть сумма к оплате",
      body: "К оплате: 4 500 ₸.",
    },
  );
  assert.equal(
    parentBalanceAlert({ classesRemainingTotal: 1, debtAmountKzt: 0 })?.kind,
    "low_classes",
  );
  assert.equal(
    parentBalanceAlert({ classesRemainingTotal: 4, debtAmountKzt: 0 }),
    null,
  );
  assert.equal(parentBalanceAlert({}), null);
});
