import { upsertAdminJournalEntry } from "../src/application/services/admin-journal.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

const PREFIX = "e2e:admin-journal-v2:fixture:";

function assertLocalQaDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Admin journal fixture blocked: MAESTRO_QA_LOCAL=true is required.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(databaseUrl)
    || /prod|production|neon|supabase|render/i.test(databaseUrl)) {
    throw new Error("Admin journal fixture blocked: DATABASE_URL is not local.");
  }
  if (process.env.FEATURE_CURATOR_WORKSPACE_V2 !== "true") {
    throw new Error("Admin journal fixture blocked: FEATURE_CURATOR_WORKSPACE_V2=true is required.");
  }
}

async function cleanup() {
  const result = await prisma.adminJournalEntry.deleteMany({
    where: { sourceKey: { startsWith: PREFIX } },
  });
  console.log(`Admin journal fixture removed: ${result.count}`);
}

async function main() {
  assertLocalQaDatabase();
  await cleanup();
  if (process.argv.includes("--cleanup")) return;

  const admin = await prisma.user.findUnique({
    where: { login: "qa_admin" },
    select: { id: true },
  });
  if (!admin) throw new Error("Run npm run db:seed:qa before the admin journal fixture.");

  const entries = [
    {
      sourceKey: `${PREFIX}crm-critical`,
      type: "crm_sync" as const,
      severity: "critical" as const,
      source: "crm" as const,
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: "QA-CRM-CRITICAL",
      title: "Не удалось обновить посещаемость",
      summary: "Новая отметка посещаемости не принята. Администратору нужно выбрать верные данные.",
      createdAt: new Date("2026-08-29T07:00:00.000Z"),
    },
    {
      sourceKey: `${PREFIX}crm-high-old`,
      type: "crm_sync" as const,
      severity: "high" as const,
      source: "crm" as const,
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: "QA-CRM-HIGH-OLD",
      title: "Данные ещё не переданы",
      summary: "Отчёт урока ещё не передан. Повторная отправка произойдёт автоматически.",
      createdAt: new Date("2026-08-27T07:00:00.000Z"),
    },
    {
      sourceKey: `${PREFIX}parent-access`,
      type: "parent_access" as const,
      severity: "normal" as const,
      source: "application" as const,
      linkedEntityType: "parent_student_link",
      linkedEntityId: "QA-PARENT-LINK",
      title: "Родительский доступ выдан",
      summary: "Администратор открыл родителю доступ к учебному профилю ученика.",
      actorId: admin.id,
      initialStatus: "resolved" as const,
      resolution: "Доступ подтверждён договором",
      createdAt: new Date("2026-08-28T07:00:00.000Z"),
    },
    {
      sourceKey: `${PREFIX}reward-low`,
      type: "reward_correction" as const,
      severity: "low" as const,
      source: "system" as const,
      linkedEntityType: "points_transaction",
      linkedEntityId: "QA-REWARD-CORRECTION",
      title: "Проверить корректировку награды",
      summary: "Тестовая запись для проверки фильтров и мобильной компоновки журнала.",
      createdAt: new Date("2026-08-29T08:00:00.000Z"),
    },
  ];

  for (const fixture of entries) {
    const { createdAt, ...params } = fixture;
    const entry = await upsertAdminJournalEntry(params);
    await prisma.adminJournalEntry.update({
      where: { id: entry.id },
      data: { createdAt, updatedAt: createdAt },
    });
  }
  console.log(`Admin journal fixture ready: ${entries.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
