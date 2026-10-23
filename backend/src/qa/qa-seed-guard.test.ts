import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { assertLocalQaDatabase } from "../../scripts/qa-database-guard.js";
import { deleteQaRewardLedger } from "../../scripts/qa-seed-ledger.js";

const QA_STUDENT = "10000000-0000-4000-8000-000000000021";
const QA_URL = "postgresql://vladislav@localhost:5432/maestro_regression?schema=public";

const saved = {
  local: process.env.MAESTRO_QA_LOCAL,
  marker: process.env.MAESTRO_QA_DB_MARKER,
  url: process.env.DATABASE_URL,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function qaEnv(overrides: { local?: string; marker?: string; url?: string } = {}) {
  process.env.MAESTRO_QA_LOCAL = overrides.local ?? "true";
  process.env.MAESTRO_QA_DB_MARKER = overrides.marker ?? "maestro-learning-regression";
  process.env.DATABASE_URL = overrides.url ?? QA_URL;
}

/** A client that records every call. `database` is what the server says it is connected to. */
function fakeClient(database: string) {
  const calls: Array<{ model: string; where: unknown }> = [];
  const model = (name: string) => ({
    deleteMany: async ({ where }: { where: unknown }) => {
      calls.push({ model: name, where });
      return { count: 1 };
    },
  });
  const client = {
    $queryRaw: async () => [{ db: database }],
    leagueXpEvent: model("leagueXpEvent"),
    pointsTransaction: model("pointsTransaction"),
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(client),
  };
  return { client: client as unknown as PrismaClient, calls };
}

describe("QA database guard", () => {
  beforeEach(() => qaEnv());
  afterEach(() => {
    restore("MAESTRO_QA_LOCAL", saved.local);
    restore("MAESTRO_QA_DB_MARKER", saved.marker);
    restore("DATABASE_URL", saved.url);
  });

  it("accepts the local regression database", () => {
    assert.doesNotThrow(() => assertLocalQaDatabase());
  });

  for (const [name, env] of [
    ["no local flag", { local: "false" }],
    ["wrong marker", { marker: "maestro-local-qa" }],
    ["other database", { url: "postgresql://vladislav@localhost:5432/maestro?schema=public" }],
    ["remote host", { url: "postgresql://u:p@db.example.com:5432/maestro_regression?schema=public" }],
    ["host override in the url", { url: `${QA_URL}&host=db.example.com` }],
    ["socket override in the url", { url: `${QA_URL}&socket=/tmp` }],
    ["invalid url", { url: "not a url" }],
  ] as const) {
    it(`blocks: ${name}`, () => {
      qaEnv(env);
      assert.throws(() => assertLocalQaDatabase(), /QA operation blocked/);
    });
  }
});

describe("deleteQaRewardLedger", () => {
  beforeEach(() => qaEnv());
  afterEach(() => {
    restore("MAESTRO_QA_LOCAL", saved.local);
    restore("MAESTRO_QA_DB_MARKER", saved.marker);
    restore("DATABASE_URL", saved.url);
  });

  it("deletes only topic and plan receipts of the given students on the QA database", async () => {
    const { client, calls } = fakeClient("maestro_regression");
    const result = await deleteQaRewardLedger(client, [QA_STUDENT]);
    assert.deepEqual(result, { points: 1, leagueXp: 1 });
    assert.deepEqual(calls.map((call) => call.model).sort(), ["leagueXpEvent", "pointsTransaction"]);
    for (const call of calls) {
      assert.deepEqual(call.where, {
        studentId: { in: [QA_STUDENT] },
        OR: [
          { sourceKey: { startsWith: "learning-topic-mastery:" } },
          { sourceKey: { startsWith: "learning-plan-completion:" } },
        ],
      });
    }
  });

  it("deletes nothing when the marker is wrong", async () => {
    qaEnv({ marker: "production" });
    const { client, calls } = fakeClient("maestro_regression");
    await assert.rejects(() => deleteQaRewardLedger(client, [QA_STUDENT]), /QA operation blocked/);
    assert.equal(calls.length, 0);
  });

  it("deletes nothing when the url looks local but the server is another database", async () => {
    const { client, calls } = fakeClient("maestro_production");
    await assert.rejects(() => deleteQaRewardLedger(client, [QA_STUDENT]), /connected to database "maestro_production"/);
    assert.equal(calls.length, 0);
  });

  it("deletes nothing for a user id outside the QA range", async () => {
    const { client, calls } = fakeClient("maestro_regression");
    await assert.rejects(
      () => deleteQaRewardLedger(client, [QA_STUDENT, "7e1f0a52-0000-4000-8000-000000000001"]),
      /not a QA user id/,
    );
    assert.equal(calls.length, 0);
  });
});
