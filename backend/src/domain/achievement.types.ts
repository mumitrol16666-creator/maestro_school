import type { AchievementCriteriaType } from "@prisma/client";

export interface AchievementDefinition {
  code: string;
  title: string;
  description: string;
  criteriaType: AchievementCriteriaType;
  threshold: number;
}

/** Built-in achievement catalog — seeded, evaluated by achievement.service */
export const DEFAULT_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    code: "first_lesson",
    title: "Первый урок",
    description: "Завершите первый урок",
    criteriaType: "first_lesson_completed",
    threshold: 1,
  },
  {
    code: "points_100",
    title: "100 баллов",
    description: "Наберите 100 баллов",
    criteriaType: "points_threshold",
    threshold: 100,
  },
  {
    code: "first_module",
    title: "Первый завершенный модуль",
    description: "Завершите все уроки первого модуля",
    criteriaType: "first_module_completed",
    threshold: 1,
  },
  {
    code: "lessons_10",
    title: "10 завершенных уроков",
    description: "Завершите 10 уроков",
    criteriaType: "lessons_completed_count",
    threshold: 10,
  },
];
