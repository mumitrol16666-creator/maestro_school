/**
 * 04.11.2026: lesson approvals that CRM accepted but the Platform could not finalize because one
 * topic percent had moved («ждёт подтверждения» on the teacher screen, no Points/Coins for the
 * lesson). After the fix such a topic is set aside for the admin, so a retry finalizes the lesson.
 *
 *   npx tsx scripts/retry-topic-stuck-approvals.ts            # list only, changes nothing
 *   npx tsx scripts/retry-topic-stuck-approvals.ts --apply    # retry each listed approval
 */
import { prisma } from "../src/infrastructure/database/prisma.js";
import { retryCrmOutboxEvent } from "../src/application/services/crm-outbox.service.js";

const TOPIC_ERRORS = [
  "Процент темы изменился",
  "Тема продолжается с",
  "Освоенная тема заблокирована",
  "Прогресс этой темы уже зафиксирован",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const events = await prisma.crmOutboxEvent.findMany({
    where: {
      eventType: "admin_approve",
      status: "conflict",
      OR: TOPIC_ERRORS.map((text) => ({ lastError: { contains: text } })),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, aggregateId: true, lastError: true, createdAt: true },
  });
  console.log(`${apply ? "Повторяю" : "Найдено (без изменений)"}: ${events.length}`);
  for (const event of events) {
    console.log(`- урок ${event.aggregateId} · ${event.createdAt.toISOString().slice(0, 16)} · ${event.lastError ?? ""}`);
    if (!apply) continue;
    try {
      const result = await retryCrmOutboxEvent(event.id);
      console.log(`  → ${result?.status ?? "нет ответа"}${result?.lastError ? ` · ${result.lastError}` : ""}`);
    } catch (error) {
      console.log(`  → ошибка: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!apply && events.length) console.log("Чтобы повторить, запустите с --apply.");

  // Closed by «Принять расписание» before the fix: CRM approved, but the lesson's attendance,
  // Points, Coins and homework were never applied here. Listed for a manual decision only.
  const closed = await prisma.crmOutboxEvent.findMany({
    where: {
      eventType: "admin_approve",
      status: "resolved",
      OR: TOPIC_ERRORS.map((text) => ({ lastError: { contains: text } })),
    },
    orderBy: { createdAt: "asc" },
    select: { aggregateId: true, lastError: true, createdAt: true },
  });
  if (closed.length) {
    console.log(`\nЗакрыты кнопкой «Принять расписание», начисления не делались: ${closed.length}`);
    for (const event of closed) {
      console.log(`- урок ${event.aggregateId} · ${event.createdAt.toISOString().slice(0, 16)} · ${event.lastError ?? ""}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
