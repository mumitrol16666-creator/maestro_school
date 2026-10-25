/**
 * Plan 5.7: the draft of three guitar steps (document 17) as sector templates, plus the school's
 * summary and homework phrases for guitar. Idempotent: a step that already exists for the
 * direction and number is left as the admins edited it; phrases are added once.
 *   npx tsx scripts/seed-guitar-steps.ts [--publish]
 */
import { prisma } from "../src/infrastructure/database/prisma.js";

type Topic = { line: "melody" | "chords" | "theory" | "song" | "other"; title: string; masteryCriteria: string };

const steps: Array<{ number: number; title: string; summary: string; topics: Topic[] }> = [
  {
    number: 1,
    title: "Первые звуки",
    summary: "Недели 1–4: посадка, настройка, три аккорда и первая песня под метроном. Экзамен: песня целиком и названия струн.",
    topics: [
      { line: "other", title: "Посадка и постановка рук", masteryCriteria: "Две минуты играет открытые струны без зажима: плечи опущены, кисть свободна, большой палец за грифом" },
      { line: "theory", title: "Названия струн и настройка", masteryCriteria: "Называет струны от 6-й к 1-й и настраивает гитару по тюнеру за 2 минуты" },
      { line: "chords", title: "Аккорды Am, Em, Dm", masteryCriteria: "Каждый аккорд звучит чисто: все струны слышны, без дребезга" },
      { line: "chords", title: "Переходы Am–Em–Dm", masteryCriteria: "10 переходов за 20 секунд без остановки и дребезга" },
      { line: "song", title: "Первая песня на трёх аккордах, бой «четвёрка»", masteryCriteria: "Куплет и припев целиком под метроном 70 BPM, без остановок" },
    ],
  },
  {
    number: 2,
    title: "Ритм и аккорды",
    summary: "Недели 5–8: открытые аккорды, бой «шестёрка» и «восьмёрка», приглушение, песня под запись. Экзамен: песня под запись и бой по выбору.",
    topics: [
      { line: "chords", title: "Аккорды C, G, D, E, A", masteryCriteria: "Каждый аккорд ставится за 3 секунды и звучит чисто" },
      { line: "chords", title: "Переходы между открытыми аккордами", masteryCriteria: "8 из 10 переходов чистые в темпе 60 BPM" },
      { line: "melody", title: "Бой «шестёрка» и «восьмёрка»", masteryCriteria: "Две минуты ровно под метроном 90 BPM, без ускорения" },
      { line: "melody", title: "Приглушение и акценты", masteryCriteria: "Куплет с приглушением ладонью и акцентом на 2 и 4" },
      { line: "song", title: "Песня на 4–5 аккордах под запись", masteryCriteria: "Играет вместе с оригинальной записью без потери темпа" },
    ],
  },
  {
    number: 3,
    title: "Баррэ и перебор",
    summary: "Недели 9–12: перебор, баррэ F и Bm, табулатура, песня целиком перед слушателями. Экзамен: песня целиком перед родителями.",
    topics: [
      { line: "melody", title: "Перебор «четвёрка» и «восьмёрка»", masteryCriteria: "Куплет без ошибок на 80 BPM, пальцы p-i-m-a по своим струнам" },
      { line: "chords", title: "Баррэ F и Bm", masteryCriteria: "Все шесть струн звучат, удержание 5 секунд × 10 без боли в кисти" },
      { line: "chords", title: "Переходы с баррэ", masteryCriteria: "6 из 10 переходов с F и Bm чистые в темпе 60 BPM" },
      { line: "theory", title: "Табулатура и длительности", masteryCriteria: "Читает и играет 8 тактов с листа: четверти, восьмые, паузы" },
      { line: "song", title: "Песня целиком: перебор + бой", masteryCriteria: "Играет песню от начала до конца под метроном и перед родителями" },
    ],
  },
];

const phrases = {
  summary: [
    "Разобрали новые аккорды и переходы",
    "Отработали бой под метроном",
    "Сыграли куплет целиком",
    "Поставили правую руку: ровные удары",
    "Закрепили переходы в медленном темпе",
    "Разобрали песню по частям",
  ],
  homework: [
    "Переходы между аккордами 5 минут в день",
    "Бой под метроном 70 BPM, 2 минуты без остановки",
    "Куплет целиком три раза подряд",
    "Записать видео куплета и прислать в чат",
    "Настроить гитару самостоятельно перед каждым занятием",
    "Перебор медленно, пальцы по своим струнам",
  ],
} as const;

async function main() {
  const publish = process.argv.includes("--publish");
  const direction = await prisma.direction.findFirst({
    where: { OR: [{ title: { equals: "Гитара", mode: "insensitive" } }, { slug: "guitar" }] },
    orderBy: { crmDirectionId: "desc" },
  });
  if (!direction) throw new Error("Направление «Гитара» не найдено");
  let created = 0;
  let kept = 0;
  for (const step of steps) {
    const existing = await prisma.sectorTemplate.findFirst({ where: { directionId: direction.id, number: step.number } });
    if (existing) {
      kept += 1;
      continue;
    }
    await prisma.sectorTemplate.create({
      data: {
        directionId: direction.id,
        number: step.number,
        title: step.title,
        summary: step.summary,
        isPublished: publish,
        topics: { create: step.topics.map((topic, index) => ({ ...topic, sortOrder: index, materials: [] })) },
      },
    });
    created += 1;
  }
  let phrasesAdded = 0;
  for (const [kind, texts] of Object.entries(phrases) as Array<["summary" | "homework", readonly string[]]>) {
    for (const [index, text] of texts.entries()) {
      const exists = await prisma.lessonTextTemplate.findFirst({ where: { ownerId: null, kind, text, crmDirectionId: direction.crmDirectionId, archivedAt: null } });
      if (exists) continue;
      await prisma.lessonTextTemplate.create({ data: { kind, text, crmDirectionId: direction.crmDirectionId, sortOrder: index } });
      phrasesAdded += 1;
    }
  }
  console.log(`Guitar steps: created ${created}, kept ${kept}; phrases added ${phrasesAdded}; direction ${direction.title} (${direction.crmDirectionId ?? "no CRM id"})${publish ? ", published" : ", unpublished"}`);
}

main().finally(() => prisma.$disconnect());
