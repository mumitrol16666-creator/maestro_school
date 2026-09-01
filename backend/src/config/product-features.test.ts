import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRODUCT_CUTOVER_AT,
  loadProductFeatureConfig,
  rewardEconomyV2AppliesToEvent,
} from "./product-features.js";

test("product features are disabled by default", () => {
  const config = loadProductFeatureConfig({});
  assert.equal(config.cutoverAt.toISOString(), DEFAULT_PRODUCT_CUTOVER_AT);
  assert.equal(Object.values(config.flags).every((enabled) => !enabled), true);
});

test("product feature switches accept explicit boolean values", () => {
  const config = loadProductFeatureConfig({
    FEATURE_LEARNING_TOPICS_V2: "true",
    FEATURE_REWARD_ECONOMY_V2: "1",
    FEATURE_ROLE_NAVIGATION_V2: "off",
  });
  assert.equal(config.flags.learningTopicsV2, true);
  assert.equal(config.flags.rewardEconomyV2, true);
  assert.equal(config.flags.roleNavigationV2, false);
});

test("invalid feature configuration fails during startup", () => {
  assert.throws(
    () => loadProductFeatureConfig({ FEATURE_REWARD_ECONOMY_V2: "sometimes" }),
    /must be a boolean switch/,
  );
  assert.throws(
    () => loadProductFeatureConfig({ PRODUCT_V2_CUTOVER_AT: "2026-09-07T00:00:00" }),
    /explicit UTC offset/,
  );
});

test("reward economy v2 requires both the flag and an event after cutover", () => {
  const disabled = loadProductFeatureConfig({});
  assert.equal(rewardEconomyV2AppliesToEvent(new Date("2026-09-07T00:00:00Z"), disabled), false);

  const enabled = loadProductFeatureConfig({ FEATURE_REWARD_ECONOMY_V2: "true" });
  assert.equal(rewardEconomyV2AppliesToEvent(new Date("2026-09-06T18:59:59.999Z"), enabled), false);
  assert.equal(rewardEconomyV2AppliesToEvent(new Date(DEFAULT_PRODUCT_CUTOVER_AT), enabled), true);
});
