import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("awardManualPoints zero-amount policy", () => {
  it("skips ledger write when amount <= 0", async () => {
    const { awardManualPoints } = await import("./points.service.js");
    const result = await awardManualPoints({
      studentId: "00000000-0000-0000-0000-000000000099",
      amount: 0,
      reason: "should not matter",
      awardedBy: "00000000-0000-0000-0000-000000000001",
    });
    assert.equal(result.awarded, false);
    assert.equal(result.transactionId, undefined);
  });
});

describe("points vs coins separation", () => {
  it("awardLessonPoints and awardManualPoints are separate entry points", async () => {
    const points = await import("./points.service.js");
    const coins = await import("./coins.service.js");
    assert.equal(typeof points.awardLessonPoints, "function");
    assert.equal(typeof points.awardManualPoints, "function");
    assert.equal(typeof coins.addMaestroCoins, "function");
    assert.notEqual(points.awardLessonPoints, coins.addMaestroCoins);
  });
});
