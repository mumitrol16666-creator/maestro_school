import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionRewardStatus,
  rewardStatusNeedsRefund,
} from "./reward-redemption-policy.js";

test("reward request follows the supported fulfilment flow", () => {
  assert.equal(canTransitionRewardStatus("requested", "approved"), true);
  assert.equal(canTransitionRewardStatus("approved", "fulfilled"), true);
  assert.equal(canTransitionRewardStatus("fulfilled", "rejected"), false);
});

test("rejection refunds only a non-rejected purchase", () => {
  assert.equal(rewardStatusNeedsRefund("requested", "rejected"), true);
  assert.equal(rewardStatusNeedsRefund("approved", "rejected"), true);
  assert.equal(rewardStatusNeedsRefund("rejected", "rejected"), false);
});
