import type { Prisma } from "@prisma/client";
import { ConflictError } from "../../domain/errors.js";

/**
 * Locks the student's wallet row for the rest of the transaction and returns its
 * current state. A wallet that was never opened in the active epoch (student was
 * inactive at cutover) is adopted: its epoch is set and its balance restarts from
 * the coins already recorded in this epoch, so the legacy balance is not summed.
 */
export async function lockStudentCoinWallet(
  tx: Prisma.TransactionClient,
  studentId: string,
  economicEpochId: string | null,
) {
  await tx.studentCoinBalance.upsert({
    where: { studentId },
    create: { studentId, balance: 0, economicEpochId },
    update: {},
  });
  await tx.$queryRaw`
    SELECT "id" FROM "student_coin_balances" WHERE "student_id" = ${studentId}::uuid FOR UPDATE
  `;
  const wallet = await tx.studentCoinBalance.findUniqueOrThrow({
    where: { studentId },
    select: { balance: true, economicEpochId: true },
  });
  if (!economicEpochId || wallet.economicEpochId === economicEpochId) return wallet;
  if (wallet.economicEpochId !== null) {
    throw new ConflictError(
      "Баланс Coins не открыт в активной экономической эпохе",
      "ECONOMIC_EPOCH_BALANCE_MISSING",
    );
  }
  const epochSum = await tx.maestroCoinTransaction.aggregate({
    where: { studentId, economicEpochId },
    _sum: { amount: true },
  });
  const balance = epochSum._sum.amount ?? 0;
  await tx.studentCoinBalance.update({
    where: { studentId },
    data: { economicEpochId, balance },
  });
  return { balance, economicEpochId };
}
