import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { ConflictError } from "../../domain/errors.js";

process.env.DATABASE_URL ??= "postgresql://maestro:maestro@127.0.0.1:5432/maestro_test";
process.env.JWT_SECRET ??= "maestro-test-jwt-secret";

const systemAward = {
  economicEpochId: null,
  studentId: "00000000-0000-4000-8000-000000000099",
  amount: 250,
  reason: "Завершён план на 2026-09",
  sourceKey: "learning-plan-completion:plan-1:student-1",
  createdAt: new Date("2026-09-05T08:00:00.000Z"),
};

const matchingReceipt = {
  id: "00000000-0000-4000-8000-000000000777",
  studentId: systemAward.studentId,
  amount: systemAward.amount,
  reason: systemAward.reason,
};

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("duplicate source key", {
    code: "P2002",
    clientVersion: Prisma.prismaVersion.client,
    meta: { target: ["source_key"] },
  });
}

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

  it("exports a dedicated idempotent system award entry point", async () => {
    const { awardSystemPoints } = await import("./points.service.js");
    assert.equal(typeof awardSystemPoints, "function");
  });
});

describe("automated points source-key idempotency", () => {
  it("returns the existing transaction only when the complete payload matches", async () => {
    const { ensureSystemPointsTransaction } = await import("./points.service.js");
    let createCalls = 0;
    const result = await ensureSystemPointsTransaction({
      findBySourceKey: async () => matchingReceipt,
      create: async () => {
        createCalls += 1;
        return matchingReceipt;
      },
    }, systemAward);

    assert.deepEqual(result, { awarded: false, transaction: matchingReceipt });
    assert.equal(createCalls, 0);
  });

  it("rejects reuse of a source key for another student, amount, or reason", async () => {
    const { ensureSystemPointsTransaction } = await import("./points.service.js");
    const conflictingReceipts = [
      { ...matchingReceipt, studentId: "00000000-0000-4000-8000-000000000098" },
      { ...matchingReceipt, amount: 100 },
      { ...matchingReceipt, reason: "Другая причина" },
    ];

    for (const receipt of conflictingReceipts) {
      await assert.rejects(
        ensureSystemPointsTransaction({
          findBySourceKey: async () => receipt,
          create: async () => matchingReceipt,
        }, systemAward),
        (error) => (
          error instanceof ConflictError
          && error.code === "POINTS_SOURCE_KEY_CONFLICT"
        ),
      );
    }
  });

  it("recovers a matching P2002 create race as an idempotent duplicate", async () => {
    const { ensureSystemPointsTransaction } = await import("./points.service.js");
    let reads = 0;
    const result = await ensureSystemPointsTransaction({
      findBySourceKey: async () => {
        reads += 1;
        return reads === 1 ? null : matchingReceipt;
      },
      create: async () => { throw p2002(); },
    }, systemAward);

    assert.deepEqual(result, { awarded: false, transaction: matchingReceipt });
    assert.equal(reads, 2);
  });

  it("does not hide a P2002 race committed with another payload", async () => {
    const { ensureSystemPointsTransaction } = await import("./points.service.js");
    let reads = 0;
    await assert.rejects(
      ensureSystemPointsTransaction({
        findBySourceKey: async () => {
          reads += 1;
          return reads === 1 ? null : { ...matchingReceipt, amount: 100 };
        },
        create: async () => { throw p2002(); },
      }, systemAward),
      (error) => (
        error instanceof ConflictError
        && error.code === "POINTS_SOURCE_KEY_CONFLICT"
      ),
    );
  });

  it("rethrows P2002 when no transaction exists for the requested source key", async () => {
    const { ensureSystemPointsTransaction } = await import("./points.service.js");
    const duplicate = p2002();
    await assert.rejects(
      ensureSystemPointsTransaction({
        findBySourceKey: async () => null,
        create: async () => { throw duplicate; },
      }, systemAward),
      (error) => error === duplicate,
    );
  });
});
