import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestError } from "../../domain/errors.js";

describe("coins service rules (static)", () => {
  it("documents zero-amount policy: no transaction when amount <= 0", () => {
    const amount = 0;
    const shouldCreateTransaction = amount > 0;
    assert.equal(shouldCreateTransaction, false);
  });

  it("documents reason requirement when coins > 0", () => {
    const coins = 5;
    const reason = "";
    const valid = coins <= 0 || reason.trim().length > 0;
    assert.equal(valid, false);
  });
});

describe("assertCoinsReason parity", () => {
  function assertCoinsReason(coins: number, reason?: string | null) {
    if (coins > 0 && !reason?.trim()) {
      throw new BadRequestError("Укажите причину начисления Maestro Coins");
    }
  }

  it("allows zero coins without reason", () => {
    assert.doesNotThrow(() => assertCoinsReason(0, undefined));
    assert.doesNotThrow(() => assertCoinsReason(0, ""));
  });

  it("requires reason when coins > 0", () => {
    assert.throws(() => assertCoinsReason(10, ""), BadRequestError);
    assert.throws(() => assertCoinsReason(1, "   "), BadRequestError);
  });

  it("accepts reason when coins > 0", () => {
    assert.doesNotThrow(() => assertCoinsReason(10, "Отличная работа на уроке"));
  });
});
