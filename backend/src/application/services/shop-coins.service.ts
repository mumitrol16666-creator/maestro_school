import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { findUserByCrmStudentId } from "../repositories/user-link.repository.js";
import { deliverUserNotification } from "./notification.service.js";

const MAX_SHOP_COINS = 2_000_000_000;

function validateAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_SHOP_COINS) {
    throw new BadRequestError("Укажите корректное количество Coins", "INVALID_SHOP_COINS_AMOUNT");
  }
}

async function requireStudent(crmStudentId: string) {
  const student = await findUserByCrmStudentId(crmStudentId);
  if (!student || student.role.slug !== "student") {
    throw new NotFoundError("Ученик");
  }
  return student;
}

async function lockBalance(tx: Prisma.TransactionClient, studentId: string) {
  await tx.studentCoinBalance.upsert({
    where: { studentId },
    create: { studentId, balance: 0 },
    update: {},
  });
  await tx.$queryRaw`
    SELECT "id"
    FROM "student_coin_balances"
    WHERE "student_id" = ${studentId}::uuid
    FOR UPDATE
  `;
  return tx.studentCoinBalance.findUniqueOrThrow({
    where: { studentId },
    select: { balance: true, economicEpochId: true },
  });
}

function assertExistingTransaction(
  existing: { studentId: string; amount: number; balanceAfter: number; id: string },
  expected: { studentId: string; amount: number },
) {
  if (existing.studentId !== expected.studentId || existing.amount !== expected.amount) {
    throw new ConflictError(
      "Повторная операция магазина не совпадает с первоначальной",
      "SHOP_COIN_IDEMPOTENCY_CONFLICT",
    );
  }
}

export async function getShopCoinBalance(crmStudentId: string) {
  const student = await requireStudent(crmStudentId);
  const balance = await prisma.studentCoinBalance.findUnique({
    where: { studentId: student.id },
    select: { balance: true },
  });
  return {
    crmStudentId,
    balance: balance?.balance ?? 0,
  };
}

export async function debitShopCoins(params: {
  crmStudentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
}) {
  validateAmount(params.amount);
  const student = await requireStudent(params.crmStudentId);
  const sourceKey = `shop-order-spend:${params.orderId}`;

  const existing = await prisma.maestroCoinTransaction.findUnique({
    where: { sourceKey },
    select: { id: true, studentId: true, amount: true, balanceAfter: true },
  });
  if (existing) {
    assertExistingTransaction(existing, { studentId: student.id, amount: -params.amount });
    return {
      debited: false as const,
      transactionId: existing.id,
      balance: existing.balanceAfter,
    };
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const repeated = await tx.maestroCoinTransaction.findUnique({
        where: { sourceKey },
        select: { id: true, studentId: true, amount: true, balanceAfter: true },
      });
      if (repeated) {
        assertExistingTransaction(repeated, { studentId: student.id, amount: -params.amount });
        return {
          debited: false as const,
          transactionId: repeated.id,
          balance: repeated.balanceAfter,
        };
      }

      const balance = await lockBalance(tx, student.id);
      if (balance.balance < params.amount) {
        throw new ConflictError(
          `Недостаточно Coins: доступно ${balance.balance}`,
          "INSUFFICIENT_COINS",
        );
      }
      const balanceAfter = balance.balance - params.amount;
      const transaction = await tx.maestroCoinTransaction.create({
        data: {
          economicEpochId: balance.economicEpochId,
          studentId: student.id,
          amount: -params.amount,
          transactionType: "spend",
          reason: `Оплата заказа ${params.orderNumber}`,
          sourceType: "shop_order",
          sourceKey,
          createdById: student.id,
          balanceBefore: balance.balance,
          balanceAfter,
        },
        select: { id: true },
      });
      await tx.studentCoinBalance.update({
        where: { studentId: student.id },
        data: { balance: balanceAfter },
      });
      return {
        debited: true as const,
        transactionId: transaction.id,
        balance: balanceAfter,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await prisma.maestroCoinTransaction.findUnique({
        where: { sourceKey },
        select: { id: true, studentId: true, amount: true, balanceAfter: true },
      });
      if (repeated) {
        assertExistingTransaction(repeated, { studentId: student.id, amount: -params.amount });
        return {
          debited: false as const,
          transactionId: repeated.id,
          balance: repeated.balanceAfter,
        };
      }
    }
    throw error;
  }

  await deliverUserNotification({
    userId: student.id,
    type: "shop_order_updated",
    title: `Заказ ${params.orderNumber} оформлен`,
    body: `Использовано ${params.amount} Coins. Остаток: ${result.balance}.`,
    url: "/rewards",
    tag: `shop-order-${params.orderId}`,
    dedupeKey: `shop-order:debited:${params.orderId}`,
  }).catch(() => undefined);

  return result;
}

export async function refundShopCoins(params: {
  crmStudentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  reason?: string | null;
}) {
  validateAmount(params.amount);
  const student = await requireStudent(params.crmStudentId);
  const debitKey = `shop-order-spend:${params.orderId}`;
  const refundKey = `shop-order-refund:${params.orderId}`;

  const debit = await prisma.maestroCoinTransaction.findUnique({
    where: { sourceKey: debitKey },
    select: { studentId: true, amount: true },
  });
  if (!debit || debit.studentId !== student.id || debit.amount !== -params.amount) {
    throw new ConflictError(
      "Исходное списание Coins для заказа не найдено",
      "SHOP_COIN_DEBIT_NOT_FOUND",
    );
  }

  const existing = await prisma.maestroCoinTransaction.findUnique({
    where: { sourceKey: refundKey },
    select: { id: true, studentId: true, amount: true, balanceAfter: true },
  });
  if (existing) {
    assertExistingTransaction(existing, { studentId: student.id, amount: params.amount });
    return {
      refunded: false as const,
      transactionId: existing.id,
      balance: existing.balanceAfter,
    };
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const repeated = await tx.maestroCoinTransaction.findUnique({
        where: { sourceKey: refundKey },
        select: { id: true, studentId: true, amount: true, balanceAfter: true },
      });
      if (repeated) {
        assertExistingTransaction(repeated, { studentId: student.id, amount: params.amount });
        return {
          refunded: false as const,
          transactionId: repeated.id,
          balance: repeated.balanceAfter,
        };
      }

      const balance = await lockBalance(tx, student.id);
      const balanceAfter = balance.balance + params.amount;
      if (!Number.isSafeInteger(balanceAfter) || balanceAfter > MAX_SHOP_COINS) {
        throw new ConflictError("Баланс Coins превышает допустимый предел", "SHOP_COIN_BALANCE_LIMIT");
      }
      const transaction = await tx.maestroCoinTransaction.create({
        data: {
          economicEpochId: balance.economicEpochId,
          studentId: student.id,
          amount: params.amount,
          transactionType: "correction",
          reason: `Возврат за заказ ${params.orderNumber}${params.reason ? `: ${params.reason}` : ""}`,
          sourceType: "shop_order",
          sourceKey: refundKey,
          balanceBefore: balance.balance,
          balanceAfter,
        },
        select: { id: true },
      });
      await tx.studentCoinBalance.update({
        where: { studentId: student.id },
        data: { balance: balanceAfter },
      });
      return {
        refunded: true as const,
        transactionId: transaction.id,
        balance: balanceAfter,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await prisma.maestroCoinTransaction.findUnique({
        where: { sourceKey: refundKey },
        select: { id: true, studentId: true, amount: true, balanceAfter: true },
      });
      if (repeated) {
        assertExistingTransaction(repeated, { studentId: student.id, amount: params.amount });
        return {
          refunded: false as const,
          transactionId: repeated.id,
          balance: repeated.balanceAfter,
        };
      }
    }
    throw error;
  }

  await deliverUserNotification({
    userId: student.id,
    type: "shop_order_updated",
    title: `Заказ ${params.orderNumber} отменён`,
    body: `Возвращено ${params.amount} Coins. Баланс: ${result.balance}.`,
    url: "/rewards",
    tag: `shop-order-refund-${params.orderId}`,
    dedupeKey: `shop-order:refunded:${params.orderId}`,
  }).catch(() => undefined);

  return result;
}
