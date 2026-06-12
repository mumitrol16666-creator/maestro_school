import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SEED_ACHIEVEMENTS } from "./seed-achievements.js";

const prisma = new PrismaClient();

const ROLES = [
  { name: "Super Admin", slug: "super_admin", description: "Platform-wide administrator" },
  { name: "Owner", slug: "owner", description: "School owner" },
  { name: "Branch Manager", slug: "branch_manager", description: "Branch operations manager" },
  { name: "Teacher", slug: "teacher", description: "Instructor" },
  { name: "Curator", slug: "curator", description: "Student progress curator" },
  { name: "Student", slug: "student", description: "Learner" },
  { name: "Admin", slug: "admin", description: "Content and learning administrator" },
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
  { code: "online_lessons.read", description: "View online lessons" },
  { code: "online_lessons.request", description: "Request online lessons" },
  { code: "online_lessons.manage", description: "Manage online lesson requests" },
  { code: "coins.read", description: "View Maestro Coins balance" },
  { code: "coins.award", description: "Award Maestro Coins manually" },
] as const;

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  super_admin: PERMISSIONS.map((permission) => permission.code),
  admin: [
    "directions.read", "courses.read", "lessons.read", "progress.read",
    "catalog.manage", "users.manage", "news.manage", "homework.review", "news.read",
    "online_lessons.read", "online_lessons.manage", "coins.read", "coins.award",
  ],
  owner: [
    "directions.read", "courses.read", "lessons.read", "catalog.manage",
    "users.manage", "news.manage", "homework.review", "news.read",
    "online_lessons.read", "online_lessons.manage", "coins.read", "coins.award",
  ],
  branch_manager: [
    "directions.read", "courses.read", "lessons.read", "users.manage", "homework.review",
    "online_lessons.read", "online_lessons.manage", "coins.read", "coins.award",
  ],
  teacher: [
    "directions.read", "courses.read", "lessons.read", "homework.review", "progress.read",
    "online_lessons.read", "online_lessons.manage", "coins.read", "coins.award",
  ],
  curator: [
    "directions.read", "courses.read", "lessons.read", "progress.read", "homework.review",
    "online_lessons.read", "online_lessons.manage", "coins.read", "coins.award",
  ],
  student: [
    "directions.read", "courses.read", "lessons.read", "progress.read",
    "progress.write", "homework.submit", "news.read", "points.read",
    "online_lessons.read", "online_lessons.request", "coins.read",
  ],
};

const adminSchema = z.object({
  ADMIN_EMAIL: z.string().trim().email().transform((value) => value.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(8).max(72),
  ADMIN_FIRST_NAME: z.string().trim().min(1).max(128),
  ADMIN_LAST_NAME: z.string().trim().min(1).max(128),
});

const adminValues = [
  process.env.ADMIN_EMAIL,
  process.env.ADMIN_PASSWORD,
  process.env.ADMIN_FIRST_NAME,
  process.env.ADMIN_LAST_NAME,
];
const hasAnyAdminValue = adminValues.some(Boolean);
const hasAllAdminValues = adminValues.every(Boolean);

if (hasAnyAdminValue && !hasAllAdminValues) {
  throw new Error(
    "Set all ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME and ADMIN_LAST_NAME values, or leave all of them empty.",
  );
}

const adminEnv = hasAllAdminValues ? adminSchema.parse(process.env) : null;

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
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

  const permissionRecords = await prisma.permission.findMany();
  const permissionByCode = Object.fromEntries(permissionRecords.map((permission) => [permission.code, permission.id]));

  for (const [roleSlug, codes] of Object.entries(ROLE_PERMISSION_MAP)) {
    for (const code of codes) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleRecords[roleSlug],
            permissionId: permissionByCode[code],
          },
        },
        update: {},
        create: {
          roleId: roleRecords[roleSlug],
          permissionId: permissionByCode[code],
        },
      });
    }
  }

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

  if (adminEnv) {
    const adminLogin = adminEnv.ADMIN_EMAIL.split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 32) || "admin";

    await prisma.user.upsert({
      where: { email: adminEnv.ADMIN_EMAIL },
      update: {
        login: adminLogin,
        phone: "00000000000",
        firstName: adminEnv.ADMIN_FIRST_NAME,
        lastName: adminEnv.ADMIN_LAST_NAME,
        passwordHash: await bcrypt.hash(adminEnv.ADMIN_PASSWORD, 10),
        roleId: roleRecords.admin,
        isActive: true,
        deletedAt: null,
      },
      create: {
        login: adminLogin,
        email: adminEnv.ADMIN_EMAIL,
        phone: "00000000000",
        passwordHash: await bcrypt.hash(adminEnv.ADMIN_PASSWORD, 10),
        firstName: adminEnv.ADMIN_FIRST_NAME,
        lastName: adminEnv.ADMIN_LAST_NAME,
        roleId: roleRecords.admin,
      },
    });
  }

  console.log(
    adminEnv
      ? "Production seed complete: roles, permissions, achievements and first admin are ready."
      : "Production seed complete: roles, permissions and achievements are ready; existing administrators were unchanged.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
