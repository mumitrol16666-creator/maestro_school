import { PrismaClient, DifficultyLevel } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_ACHIEVEMENTS } from "./seed-achievements.js";

const prisma = new PrismaClient();

const ROLES = [
  { name: "Super Admin", slug: "super_admin", description: "Platform-wide administrator" },
  { name: "Owner", slug: "owner", description: "School owner" },
  { name: "Branch Manager", slug: "branch_manager", description: "Branch operations manager" },
  { name: "Teacher", slug: "teacher", description: "Instructor" },
  { name: "Curator", slug: "curator", description: "Student progress curator" },
  { name: "Student", slug: "student", description: "Learner" },
  // Phase 1 operational alias — maps to admin UX; permissions subset of super_admin
  { name: "Admin", slug: "admin", description: "Phase-1 administrator (operational)" },
] as const;

const PERMISSIONS = [
  { code: "directions.read", description: "View learning directions" },
  { code: "courses.read", description: "View courses" },
  { code: "lessons.read", description: "View lessons" },
  { code: "progress.read", description: "View own learning progress" },
  { code: "progress.write", description: "Update lesson progress" },
  { code: "homework.submit", description: "Submit homework" },
  { code: "news.read", description: "View news board" },
  { code: "points.read", description: "View points balance" },
  { code: "catalog.manage", description: "Manage directions, courses, lessons" },
  { code: "users.manage", description: "Manage users and roles" },
  { code: "news.manage", description: "Publish news posts" },
  { code: "homework.review", description: "Review homework submissions" },
] as const;

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  super_admin: PERMISSIONS.map((p) => p.code),
  admin: [
    "directions.read", "courses.read", "lessons.read", "progress.read",
    "catalog.manage", "users.manage", "news.manage", "homework.review", "news.read",
  ],
  owner: ["directions.read", "courses.read", "lessons.read", "catalog.manage", "users.manage", "news.manage"],
  branch_manager: ["directions.read", "courses.read", "lessons.read", "users.manage", "homework.review"],
  teacher: ["directions.read", "courses.read", "lessons.read", "homework.review", "progress.read"],
  curator: ["directions.read", "courses.read", "lessons.read", "progress.read", "homework.review"],
  student: ["directions.read", "courses.read", "lessons.read", "progress.read", "progress.write", "homework.submit", "news.read", "points.read"],
};

async function main() {
  // Roles & permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
  }

  const roleRecords: Record<string, string> = {};
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description },
      create: role,
    });
    roleRecords[role.slug] = record.id;
  }

  const allPerms = await prisma.permission.findMany();
  const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p.id]));

  for (const [roleSlug, codes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleId = roleRecords[roleSlug];
    if (!roleId) continue;
    for (const code of codes) {
      const permissionId = permByCode[code];
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  const passwordHash = await bcrypt.hash("student123", 10);
  const adminHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@maestro.local" },
    update: {},
    create: {
      email: "admin@maestro.local",
      passwordHash: adminHash,
      firstName: "Maestro",
      lastName: "Admin",
      roleId: roleRecords.admin,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@maestro.local" },
    update: {},
    create: {
      email: "student@maestro.local",
      passwordHash,
      firstName: "Алексей",
      lastName: "Миронов",
      roleId: roleRecords.student,
    },
  });

  // Future multi-tenancy scaffold (no business logic)
  const school = await prisma.school.upsert({
    where: { slug: "maestro-main" },
    update: {},
    create: {
      title: "Maestro Music School",
      slug: "maestro-main",
      description: "Primary school entity for future multi-branch expansion",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { schoolId_slug: { schoolId: school.id, slug: "central" } },
    update: {},
    create: {
      schoolId: school.id,
      title: "Центральный филиал",
      slug: "central",
      address: "г. Алматы",
    },
  });

  for (const achievement of SEED_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: {
        title: achievement.title,
        description: achievement.description,
        criteriaType: achievement.criteriaType,
        threshold: achievement.threshold,
      },
      create: achievement,
    });
  }

  await prisma.teacher.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      branchId: branch.id,
      title: "Senior Instructor",
      bio: "Placeholder teacher profile for future scheduling module",
    },
  });

  // Catalog
  const directions = [
    { title: "Гитара", slug: "guitar", description: "Акустическая и электрогитара" },
    { title: "Фортепиано", slug: "piano", description: "Классическое и современное фортепиано" },
    { title: "Вокал", slug: "vocal", description: "Постановка голоса и сценическая подача" },
  ];

  for (const dir of directions) {
    const direction = await prisma.direction.upsert({
      where: { slug: dir.slug },
      update: { title: dir.title, description: dir.description, isPublished: true, schoolId: school.id },
      create: { ...dir, isPublished: true, schoolId: school.id },
    });

    if (dir.slug !== "guitar") continue;

    const course = await prisma.course.upsert({
      where: { id: "00000000-0000-4000-8000-000000000101" },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000101",
        directionId: direction.id,
        branchId: branch.id,
        title: "Гитара. Курс 1",
        description: "Уверенный старт: от первых аккордов до любимых песен.",
        difficultyLevel: DifficultyLevel.beginner,
        isPublished: true,
        thumbnail: null,
      },
    });

    await prisma.studentCourse.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
      update: { status: "active" },
      create: { studentId: student.id, courseId: course.id, status: "active" },
    });

    const module = await prisma.courseModule.upsert({
      where: { id: "00000000-0000-4000-8000-000000000201" },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000201",
        courseId: course.id,
        title: "Модуль 1. Основы",
        description: "Вводный блок",
        sortOrder: 1,
      },
    });

    const lessons = [
      {
        id: "00000000-0000-4000-8000-000000000301",
        title: "Знакомство с инструментом",
        sortOrder: 1,
        pointsReward: 80,
        status: "completed" as const,
      },
      {
        id: "00000000-0000-4000-8000-000000000302",
        title: "Первые аккорды",
        sortOrder: 2,
        pointsReward: 100,
        status: "submitted" as const,
      },
      {
        id: "00000000-0000-4000-8000-000000000303",
        title: "Ровный бой",
        sortOrder: 3,
        pointsReward: 90,
        status: "available" as const,
      },
      {
        id: "00000000-0000-4000-8000-000000000304",
        title: "Первая песня",
        sortOrder: 4,
        pointsReward: 140,
        status: "locked" as const,
      },
    ];

    for (const lessonData of lessons) {
      const lesson = await prisma.lesson.upsert({
        where: { id: lessonData.id },
        update: {
          title: lessonData.title,
          pointsReward: lessonData.pointsReward,
          sortOrder: lessonData.sortOrder,
        },
        create: {
          id: lessonData.id,
          moduleId: module.id,
          title: lessonData.title,
          description: `Урок: ${lessonData.title}`,
          videoUrl: "https://example.com/video/placeholder",
          sortOrder: lessonData.sortOrder,
          pointsReward: lessonData.pointsReward,
          isPublished: true,
        },
      });

      await prisma.lessonProgress.upsert({
        where: {
          studentId_lessonId: { studentId: student.id, lessonId: lesson.id },
        },
        update: {
          status: lessonData.status,
          completedAt: lessonData.status === "completed" ? new Date() : null,
        },
        create: {
          studentId: student.id,
          lessonId: lesson.id,
          status: lessonData.status,
          completedAt: lessonData.status === "completed" ? new Date() : null,
        },
      });

      const homeworkIds = [
        "00000000-0000-4000-8000-000000000601",
        "00000000-0000-4000-8000-000000000602",
        "00000000-0000-4000-8000-000000000603",
        "00000000-0000-4000-8000-000000000604",
      ];
      const homeworkId = homeworkIds[lessonData.sortOrder - 1];

      const homework = await prisma.homework.upsert({
        where: { id: homeworkId },
        update: { description: `Домашнее задание к уроку «${lessonData.title}»` },
        create: {
          id: homeworkId,
          lessonId: lesson.id,
          description: `Домашнее задание к уроку «${lessonData.title}»`,
        },
      });

      if (lessonData.status === "submitted") {
        await prisma.homeworkSubmission.upsert({
          where: { id: "00000000-0000-4000-8000-000000000401" },
          update: { status: "submitted" },
          create: {
            id: "00000000-0000-4000-8000-000000000401",
            homeworkId: homework.id,
            studentId: student.id,
            comment: "Черновик отправки",
            status: "submitted",
          },
        });
      }

      if (lessonData.sortOrder === 1) {
        await prisma.lessonMaterial.upsert({
          where: { id: "00000000-0000-4000-8000-000000000501" },
          update: {},
          create: {
            id: "00000000-0000-4000-8000-000000000501",
            lessonId: lesson.id,
            type: "pdf",
            title: "Памятка: правильная посадка",
            url: "https://example.com/materials/posture.pdf",
            sortOrder: 1,
          },
        });
      }
    }

    const lesson1Id = "00000000-0000-4000-8000-000000000301";

    await prisma.pointsTransaction.deleteMany({
      where: { studentId: student.id },
    });

    await prisma.pointsTransaction.createMany({
      data: [
        {
          studentId: student.id,
          lessonId: lesson1Id,
          amount: 80,
          reason: "Урок «Знакомство с инструментом»",
          awardedBy: admin.id,
        },
        {
          studentId: student.id,
          amount: 50,
          reason: "Бонус за активность",
          awardedBy: admin.id,
        },
      ],
    });

    await prisma.studentAchievement.upsert({
      where: {
        studentId_achievementId: {
          studentId: student.id,
          achievementId: (
            await prisma.achievement.findUniqueOrThrow({ where: { code: "first_lesson" } })
          ).id,
        },
      },
      update: {},
      create: {
        studentId: student.id,
        achievementId: (
          await prisma.achievement.findUniqueOrThrow({ where: { code: "first_lesson" } })
        ).id,
      },
    });
  }

  await prisma.newsPost.create({
    data: {
      title: "Летний концерт Maestro",
      content: "Встречаемся 21 июня на большой сцене. В программе — выступления учеников, джем и много музыки.",
      authorId: admin.id,
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  console.log("Seed complete.");
  console.log("  Admin:   admin@maestro.local / admin123");
  console.log("  Student: student@maestro.local / student123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
