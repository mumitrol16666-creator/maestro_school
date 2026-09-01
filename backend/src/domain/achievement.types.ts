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
  {
    code: "offline_lesson_1",
    title: "Первый урок с преподавателем",
    description: "Посетите первый подтверждённый урок с преподавателем",
    criteriaType: "offline_lessons_completed_count",
    threshold: 1,
  },
  {
    code: "offline_lessons_10",
    title: "10 уроков с преподавателем",
    description: "Посетите 10 подтверждённых уроков с преподавателем",
    criteriaType: "offline_lessons_completed_count",
    threshold: 10,
  },
  {
    code: "offline_lessons_25",
    title: "Стабильный ритм",
    description: "Посетите 25 подтверждённых уроков с преподавателем",
    criteriaType: "offline_lessons_completed_count",
    threshold: 25,
  },
  {
    code: "points_300",
    title: "300 баллов",
    description: "Наберите 300 учебных баллов",
    criteriaType: "points_threshold",
    threshold: 300,
  },
  {
    code: "points_500",
    title: "500 баллов",
    description: "Наберите 500 учебных баллов",
    criteriaType: "points_threshold",
    threshold: 500,
  },
  {
    code: "homework_3",
    title: "ДЗ без пауз",
    description: "Выполните домашнее задание к трём урокам с преподавателем",
    criteriaType: "homework_completed_count",
    threshold: 3,
  },
  {
    code: "homework_10",
    title: "Ответственный музыкант",
    description: "Выполните домашнее задание к десяти урокам с преподавателем",
    criteriaType: "homework_completed_count",
    threshold: 10,
  },
  {
    code: "monthly_plan_1",
    title: "Цель месяца",
    description: "Освойте все темы одного месячного плана",
    criteriaType: "monthly_plans_completed_count",
    threshold: 1,
  },
  {
    code: "coins_25",
    title: "Первые 25 Coins",
    description: "Заработайте 25 Maestro Coins",
    criteriaType: "coins_earned_threshold",
    threshold: 25,
  },
  {
    code: "coins_100",
    title: "Сотня Maestro Coins",
    description: "Заработайте 100 Maestro Coins",
    criteriaType: "coins_earned_threshold",
    threshold: 100,
  },
];
