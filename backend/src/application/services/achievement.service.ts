import { prisma } from "../../infrastructure/database/prisma.js";
import { isModuleCompleted } from "./course-progress.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { countCompletedLessons, getCourseModules } from "../repositories/learning.repository.js";

export async function evaluateAchievements(
  studentId: string,
  courseId?: string,
): Promise<string[]> {
  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
  });

  const existing = await prisma.studentAchievement.findMany({
    where: { studentId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(existing.map((e) => e.achievementId));

  const newlyEarned: string[] = [];

  const [points, completedLessons] = await Promise.all([
    calculateStudentPoints(studentId),
    countCompletedLessons(studentId),
  ]);

  for (const achievement of achievements) {
    if (earnedIds.has(achievement.id)) continue;

    let earned = false;

    switch (achievement.criteriaType) {
      case "first_lesson_completed":
        earned = completedLessons >= achievement.threshold;
        break;
      case "points_threshold":
        earned = points >= achievement.threshold;
        break;
      case "lessons_completed_count":
        earned = completedLessons >= achievement.threshold;
        break;
      case "first_module_completed": {
        if (!courseId) break;
        const modules = await getCourseModules(courseId);
        const firstModule = modules[0];
        if (firstModule) {
          earned = await isModuleCompleted(studentId, firstModule.id);
        }
        break;
      }
    }

    if (earned) {
      await prisma.studentAchievement.create({
        data: { studentId, achievementId: achievement.id },
      });
      newlyEarned.push(achievement.code);
      earnedIds.add(achievement.id);
    }
  }

  return newlyEarned;
}

export async function getStudentAchievements(studentId: string) {
  return prisma.studentAchievement.findMany({
    where: { studentId },
    include: {
      achievement: {
        select: { code: true, title: true, description: true },
      },
    },
    orderBy: { earnedAt: "desc" },
  });
}
