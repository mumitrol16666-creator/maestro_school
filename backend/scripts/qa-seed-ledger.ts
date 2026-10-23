import type { PrismaClient } from "@prisma/client";
import { assertConnectedQaDatabase, assertLocalQaDatabase } from "./qa-database-guard.js";

/** Reward receipts the app writes for finished topics and plans. The seed recreates the topics, so it clears these. */
export const QA_REWARD_SOURCE_PREFIXES = [
  "learning-topic-mastery:",
  "learning-plan-completion:",
] as const;

// All QA users live in this id range (see QA_IDS in qa-seed.ts). A real student never matches it.
const QA_USER_ID_PREFIX = "10000000-0000-4000-8000-";

/**
 * Deletes points and league XP receipts of the given QA students for finished topics and plans.
 *
 * This removes money-like rows, so the function guards itself and cannot be called on another
 * database: it re-checks the marker and URL, asks the server which database it is connected to,
 * and refuses any user id outside the QA range. All checks run before the first delete.
 */
export async function deleteQaRewardLedger(
  client: PrismaClient,
  studentIds: readonly string[],
) {
  assertLocalQaDatabase();
  await assertConnectedQaDatabase(client);
  for (const studentId of studentIds) {
    if (!studentId.startsWith(QA_USER_ID_PREFIX)) {
      throw new Error(`QA operation blocked: ${studentId} is not a QA user id.`);
    }
  }
  if (studentIds.length === 0) return { points: 0, leagueXp: 0 };

  const where = {
    studentId: { in: [...studentIds] },
    OR: QA_REWARD_SOURCE_PREFIXES.map((prefix) => ({ sourceKey: { startsWith: prefix } })),
  };
  return client.$transaction(async (tx) => {
    const leagueXp = await tx.leagueXpEvent.deleteMany({ where });
    const points = await tx.pointsTransaction.deleteMany({ where });
    return { points: points.count, leagueXp: leagueXp.count };
  });
}
