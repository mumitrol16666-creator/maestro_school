/**
 * Prepare the production database for launch with real courses and students.
 *
 * Keeps:
 * - roles, permissions, achievements definitions
 * - users with admin/super_admin roles (and optional KEEP_EMAILS)
 *
 * Removes:
 * - all other users and their learning activity
 * - all directions, courses, lessons and homework
 * - all news posts, online lessons, notifications, audit logs
 *
 * Usage:
 *   npm run db:prepare-production -- --dry-run
 *   CONFIRM=prepare-production npm run db:prepare-production
 *
 * Optional env:
 *   KEEP_ROLE_SLUGS=admin,super_admin,owner
 *   KEEP_EMAILS=admin@maestro.local
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEEP_ROLE_SLUGS = (process.env.KEEP_ROLE_SLUGS ?? "admin,super_admin")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const KEEP_EMAILS = (process.env.KEEP_EMAILS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const dryRun = process.argv.includes("--dry-run");
const confirmed = process.env.CONFIRM === "prepare-production";

type Counts = Record<string, number>;

async function countRows(): Promise<Counts> {
  const [
    users,
    keepers,
    directions,
    courses,
    lessons,
    enrollments,
    lessonProgress,
    homeworkSubmissions,
    onlineLessons,
    newsPosts,
    points,
    coins,
    achievements,
    notifications,
    pushSubscriptions,
    auditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        OR: [
          { role: { slug: { in: KEEP_ROLE_SLUGS } } },
          ...(KEEP_EMAILS.length ? [{ email: { in: KEEP_EMAILS } }] : []),
        ],
      },
    }),
    prisma.direction.count(),
    prisma.course.count(),
    prisma.lesson.count(),
    prisma.studentCourse.count(),
    prisma.lessonProgress.count(),
    prisma.homeworkSubmission.count(),
    prisma.onlineLessonRequest.count(),
    prisma.newsPost.count(),
    prisma.pointsTransaction.count(),
    prisma.maestroCoinTransaction.count(),
    prisma.studentAchievement.count(),
    prisma.userNotification.count(),
    prisma.pushSubscription.count(),
    prisma.auditLog.count(),
  ]);

  return {
    users,
    keepers,
    usersToDelete: users - keepers,
    directions,
    courses,
    lessons,
    enrollments,
    lessonProgress,
    homeworkSubmissions,
    onlineLessons,
    newsPosts,
    points,
    coins,
    achievements,
    notifications,
    pushSubscriptions,
    auditLogs,
  };
}

async function printKeeperUsers() {
  const keepers = await prisma.user.findMany({
    where: {
      OR: [
        { role: { slug: { in: KEEP_ROLE_SLUGS } } },
        ...(KEEP_EMAILS.length ? [{ email: { in: KEEP_EMAILS } }] : []),
      ],
    },
    select: {
      email: true,
      login: true,
      firstName: true,
      lastName: true,
      role: { select: { slug: true } },
    },
    orderBy: { email: "asc" },
  });

  console.log("Users that will be kept:");
  for (const user of keepers) {
    console.log(`  - ${user.email} (${user.login}) — ${user.firstName} ${user.lastName}, role=${user.role.slug}`);
  }
}

async function wipeDatabase() {
  await prisma.$transaction(async (tx) => {
    await tx.onlineLessonAssignmentSubmission.deleteMany();
    await tx.onlineLessonAssignmentMaterial.deleteMany();
    await tx.onlineLessonAssignment.deleteMany();
    await tx.onlineLessonRequest.deleteMany();

    await tx.homeworkSubmission.deleteMany();
    await tx.homework.deleteMany();

    await tx.lessonQuestion.deleteMany();
    await tx.lessonProgress.deleteMany();
    await tx.pointsTransaction.deleteMany();
    await tx.studentAchievement.deleteMany();
    await tx.studentCourse.deleteMany();
    await tx.maestroCoinTransaction.deleteMany();
    await tx.studentCoinBalance.deleteMany();

    await tx.userNotification.deleteMany();
    await tx.pushSubscription.deleteMany();
    await tx.newsPost.deleteMany();
    await tx.auditLog.deleteMany();

    await tx.lessonMaterial.deleteMany();
    await tx.lesson.deleteMany();
    await tx.courseModule.deleteMany();
    await tx.course.deleteMany();
    await tx.direction.deleteMany();

    const keepers = await tx.user.findMany({
      where: {
        OR: [
          { role: { slug: { in: KEEP_ROLE_SLUGS } } },
          ...(KEEP_EMAILS.length ? [{ email: { in: KEEP_EMAILS } }] : []),
        ],
      },
      select: { id: true },
    });
    const keeperIds = keepers.map((user) => user.id);

    if (!keeperIds.length) {
      throw new Error("No keeper users found. Aborting to avoid deleting every account.");
    }

    await tx.teacher.deleteMany({
      where: { userId: { notIn: keeperIds } },
    });

    const deletedUsers = await tx.user.deleteMany({
      where: { id: { notIn: keeperIds } },
    });

    console.log(`Deleted users: ${deletedUsers.count}`);
  });
}

async function main() {
  console.log("Maestro production preparation");
  console.log(`Keeper roles: ${KEEP_ROLE_SLUGS.join(", ")}`);
  if (KEEP_EMAILS.length) {
    console.log(`Keeper emails: ${KEEP_EMAILS.join(", ")}`);
  }

  const before = await countRows();
  console.log("\nCurrent database:");
  for (const [key, value] of Object.entries(before)) {
    console.log(`  ${key}: ${value}`);
  }

  await printKeeperUsers();

  if (dryRun) {
    console.log("\nDry run only — no changes were made.");
    return;
  }

  if (!confirmed) {
    console.log("\nTo apply cleanup, run:");
    console.log("  CONFIRM=prepare-production npm run db:prepare-production");
    return;
  }

  if (before.keepers === 0) {
    throw new Error("No keeper users found. Set KEEP_ROLE_SLUGS or KEEP_EMAILS before running.");
  }

  console.log("\nApplying cleanup...");
  await wipeDatabase();

  const after = await countRows();
  console.log("\nDatabase after cleanup:");
  for (const [key, value] of Object.entries(after)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log("\nProduction preparation complete.");
  console.log("Next steps: create real directions/courses in admin CMS and register students.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
