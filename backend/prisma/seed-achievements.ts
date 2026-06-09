/** Seed-only achievement definitions (decoupled from src/ for stable prisma db seed). */
export const SEED_ACHIEVEMENTS = [
  {
    code: "first_lesson",
    title: "Первый урок",
    description: "Завершите первый урок",
    criteriaType: "first_lesson_completed" as const,
    threshold: 1,
  },
  {
    code: "points_100",
    title: "100 баллов",
    description: "Наберите 100 баллов",
    criteriaType: "points_threshold" as const,
    threshold: 100,
  },
  {
    code: "first_module",
    title: "Первый завершенный модуль",
    description: "Завершите все уроки первого модуля",
    criteriaType: "first_module_completed" as const,
    threshold: 1,
  },
  {
    code: "lessons_10",
    title: "10 завершенных уроков",
    description: "Завершите 10 уроков",
    criteriaType: "lessons_completed_count" as const,
    threshold: 10,
  },
];

/** Stable UUIDs from seed — used by smoke test */
export const SEED_IDS = {
  course: "00000000-0000-4000-8000-000000000101",
  module: "00000000-0000-4000-8000-000000000201",
  lessons: {
    l1: "00000000-0000-4000-8000-000000000301",
    l2: "00000000-0000-4000-8000-000000000302",
    l3: "00000000-0000-4000-8000-000000000303",
    l4: "00000000-0000-4000-8000-000000000304",
  },
  homeworks: {
    h1: "00000000-0000-4000-8000-000000000601",
    h2: "00000000-0000-4000-8000-000000000602",
    h3: "00000000-0000-4000-8000-000000000603",
    h4: "00000000-0000-4000-8000-000000000604",
  },
  submissionL2: "00000000-0000-4000-8000-000000000401",
} as const;
