import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertLocalQaDatabase } from "./qa-database-guard.js";

const prisma = new PrismaClient();

const QA_PASSWORD = "QaMaestro2026!";
const QA_IDS = {
  admin: "10000000-0000-4000-8000-000000000001",
  teacher1: "10000000-0000-4000-8000-000000000011",
  teacher2: "10000000-0000-4000-8000-000000000012",
  student1: "10000000-0000-4000-8000-000000000021",
  student2: "10000000-0000-4000-8000-000000000022",
  student3: "10000000-0000-4000-8000-000000000023",
  student4: "10000000-0000-4000-8000-000000000024",
  parent1: "10000000-0000-4000-8000-000000000031",
  parent2: "10000000-0000-4000-8000-000000000032",
  school: "10000000-0000-4000-8000-000000000041",
  branch: "10000000-0000-4000-8000-000000000042",
  studentPlan: "10000000-0000-4000-8000-000000000051",
  groupPlan: "10000000-0000-4000-8000-000000000052",
  learningStudentPlan: "052984cc-bae2-49c3-8075-eef9fa9b1d05",
  learningGroupPlan: "3500b388-e9e1-4403-b5ec-30c2581d985f",
  learningStudentPlanVersion: "22104bdb-b18c-42e2-9ee6-05d3e52bea26",
  learningGroupPlanVersion: "001c50db-70a6-44e6-ba2d-13f15f340760",
  learningStudentTopic: "6f8c041a-f6e2-445b-93d0-b376a42a60d7",
  learningStudentTopicSecond: "3bec31a7-592e-447e-bcba-3024f3df8e55",
  learningGroupTopic: "e0699756-3838-4cb0-8d25-8aac7617a64d",
  learningIndividualAssignment: "40000000-0000-4000-8000-000000000001",
  learningGroupAssignment: "40000000-0000-4000-8000-000000000002",
} as const;

const CRM = {
  teacher1: "QA-TEACHER-1",
  teacher2: "QA-TEACHER-2",
  student1: "QA-STUDENT-1",
  student2: "QA-STUDENT-2",
  student3: "QA-STUDENT-3",
  student4: "QA-STUDENT-4",
  group1: "QA-GROUP-1",
  individualPrevious: "QA-CLASS-IND-PREVIOUS",
  individualEditable: "QA-CLASS-IND-EDITABLE",
  individualUpcoming: "QA-CLASS-IND-UPCOMING",
  groupPrevious: "QA-CLASS-GROUP-PREVIOUS",
  groupEditable: "QA-CLASS-GROUP-EDITABLE",
  groupUpcoming: "QA-CLASS-GROUP-UPCOMING",
} as const;

function mondayWeeksAgo(weeksAgo: number) {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 - weeksAgo * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function upsertUser(input: {
  id: string;
  roleId: string;
  login: string;
  firstName: string;
  lastName: string;
  phone: string;
  crmStudentId?: string;
  crmTeacherId?: string;
  isActive?: boolean;
}) {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  return prisma.user.upsert({
    where: { id: input.id },
    update: {
      login: input.login,
      email: `${input.login}@qa.maestro.local`,
      phone: input.phone,
      phoneNormalized: input.phone.replace(/\D/g, ""),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: input.roleId,
      crmStudentId: input.crmStudentId ?? null,
      crmTeacherId: input.crmTeacherId ?? null,
      externalLinkStatus: input.crmStudentId || input.crmTeacherId ? "linked" : null,
      linkedAt: input.crmStudentId || input.crmTeacherId ? new Date() : null,
      isActive: input.isActive ?? true,
      deletedAt: input.isActive === false ? new Date() : null,
    },
    create: {
      id: input.id,
      login: input.login,
      email: `${input.login}@qa.maestro.local`,
      phone: input.phone,
      phoneNormalized: input.phone.replace(/\D/g, ""),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      roleId: input.roleId,
      crmStudentId: input.crmStudentId,
      crmTeacherId: input.crmTeacherId,
      externalLinkStatus: input.crmStudentId || input.crmTeacherId ? "linked" : null,
      linkedAt: input.crmStudentId || input.crmTeacherId ? new Date() : null,
      isActive: input.isActive ?? true,
      deletedAt: input.isActive === false ? new Date() : null,
    },
  });
}

async function main() {
  assertLocalQaDatabase();

  const disposableEpochs = await prisma.economicEpoch.findMany({
    where: { code: { startsWith: "e2e-economy-v2-" } },
    select: { id: true },
  });
  const disposableEpochIds = disposableEpochs.map((epoch) => epoch.id);
  if (disposableEpochIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({
        where: { entityType: "economic_epoch", entityId: { in: disposableEpochIds } },
      });
      await tx.pointsTransaction.deleteMany({
        where: { economicEpochId: { in: disposableEpochIds } },
      });
      await tx.weeklyLeagueSnapshotEntry.deleteMany({
        where: { snapshot: { economicEpochId: { in: disposableEpochIds } } },
      });
      await tx.weeklyLeagueSnapshot.deleteMany({
        where: { economicEpochId: { in: disposableEpochIds } },
      });
      await tx.leagueXpEvent.deleteMany({
        where: { economicEpochId: { in: disposableEpochIds } },
      });
      await tx.weeklyLeagueAward.deleteMany({
        where: { economicEpochId: { in: disposableEpochIds } },
      });
      await tx.maestroCoinTransaction.deleteMany({
        where: { economicEpochId: { in: disposableEpochIds } },
      });
      await tx.studentCoinBalance.updateMany({
        where: { economicEpochId: { in: disposableEpochIds } },
        data: { economicEpochId: null },
      });
      await tx.economicEpoch.deleteMany({ where: { id: { in: disposableEpochIds } } });
    });
  }

  const roles = Object.fromEntries(
    (await prisma.role.findMany({ where: { slug: { in: ["admin", "teacher", "student", "parent"] } } }))
      .map((role) => [role.slug, role.id]),
  );
  for (const slug of ["admin", "teacher", "student", "parent"]) {
    if (!roles[slug]) throw new Error(`Run the normal production seed first: missing role ${slug}.`);
  }

  await prisma.school.upsert({
    where: { slug: "qa-maestro" },
    update: { title: "Maestro QA", isActive: true, deletedAt: null },
    create: { id: QA_IDS.school, slug: "qa-maestro", title: "Maestro QA" },
  });
  await prisma.branch.upsert({
    where: { schoolId_slug: { schoolId: QA_IDS.school, slug: "qa-main" } },
    update: { title: "QA филиал", isActive: true, deletedAt: null },
    create: { id: QA_IDS.branch, schoolId: QA_IDS.school, slug: "qa-main", title: "QA филиал" },
  });

  const users = await Promise.all([
    upsertUser({ id: QA_IDS.admin, roleId: roles.admin, login: "qa_admin", firstName: "Анна", lastName: "Администратор", phone: "+77000000001" }),
    upsertUser({ id: QA_IDS.teacher1, roleId: roles.teacher, login: "qa_teacher_1", firstName: "Владислав", lastName: "Сидоров", phone: "+77000000011", crmTeacherId: CRM.teacher1 }),
    upsertUser({ id: QA_IDS.teacher2, roleId: roles.teacher, login: "qa_teacher_2", firstName: "Джулия", lastName: "Иващенко", phone: "+77000000012", crmTeacherId: CRM.teacher2 }),
    upsertUser({ id: QA_IDS.student1, roleId: roles.student, login: "qa_student_1", firstName: "Камбар", lastName: "Казыбаев", phone: "+77000000021", crmStudentId: CRM.student1 }),
    upsertUser({ id: QA_IDS.student2, roleId: roles.student, login: "qa_student_2", firstName: "Алина", lastName: "Серикова", phone: "+77000000022", crmStudentId: CRM.student2 }),
    upsertUser({ id: QA_IDS.student3, roleId: roles.student, login: "qa_student_3", firstName: "Максим", lastName: "Ахметов", phone: "+77000000023", crmStudentId: CRM.student3 }),
    upsertUser({ id: QA_IDS.student4, roleId: roles.student, login: "qa_student_4", firstName: "Архивный", lastName: "Ученик", phone: "+77000000024", crmStudentId: CRM.student4, isActive: false }),
    upsertUser({ id: QA_IDS.parent1, roleId: roles.parent, login: "qa_parent_1", firstName: "Айгуль", lastName: "Казыбаева", phone: "+77000000031" }),
    upsertUser({ id: QA_IDS.parent2, roleId: roles.parent, login: "qa_parent_2", firstName: "Руслан", lastName: "Казыбаев", phone: "+77000000032" }),
  ]);

  await prisma.userNotification.deleteMany({
    where: { userId: { in: users.map((user) => user.id) } },
  });

  await Promise.all([
    prisma.teacher.upsert({
      where: { userId: QA_IDS.teacher1 },
      update: { branchId: QA_IDS.branch, title: "Преподаватель гитары", isActive: true, deletedAt: null },
      create: { userId: QA_IDS.teacher1, branchId: QA_IDS.branch, title: "Преподаватель гитары" },
    }),
    prisma.teacher.upsert({
      where: { userId: QA_IDS.teacher2 },
      update: { branchId: QA_IDS.branch, title: "Преподаватель вокала", isActive: true, deletedAt: null },
      create: { userId: QA_IDS.teacher2, branchId: QA_IDS.branch, title: "Преподаватель вокала" },
    }),
    prisma.parentStudentLink.upsert({
      where: { parentUserId_studentUserId: { parentUserId: QA_IDS.parent1, studentUserId: QA_IDS.student1 } },
      update: { isActive: true, revokedAt: null, createdById: QA_IDS.admin },
      create: { parentUserId: QA_IDS.parent1, studentUserId: QA_IDS.student1, relationship: "mother", createdById: QA_IDS.admin },
    }),
    prisma.parentStudentLink.upsert({
      where: { parentUserId_studentUserId: { parentUserId: QA_IDS.parent2, studentUserId: QA_IDS.student1 } },
      update: { isActive: true, revokedAt: null, createdById: QA_IDS.admin },
      create: { parentUserId: QA_IDS.parent2, studentUserId: QA_IDS.student1, relationship: "father", createdById: QA_IDS.admin },
    }),
  ]);

  const guitar = await prisma.direction.upsert({
    where: { slug: "guitar" },
    update: { schoolId: QA_IDS.school, isPublished: true },
    create: { title: "Гитара", slug: "guitar", crmDirectionId: "QA-DIRECTION-GUITAR", schoolId: QA_IDS.school, isPublished: true },
  });
  await prisma.direction.upsert({
    where: { slug: "vocal" },
    update: { schoolId: QA_IDS.school, isPublished: true },
    create: { title: "Вокал", slug: "vocal", crmDirectionId: "QA-DIRECTION-VOCAL", schoolId: QA_IDS.school, isPublished: true },
  });

  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit" })
    .format(new Date());
  const individualItems = [
    { id: "qa-ind-1", title: "Постановка рук", status: "done", progress: 100 },
    { id: "qa-ind-2", title: "Переходы между аккордами", status: "in_progress", progress: 70 },
    { id: "qa-ind-3", title: "Ритм восьмыми", status: "in_progress", progress: 99 },
    { id: "qa-ind-4", title: "Первый куплет песни", status: "planned", progress: 0 },
  ];
  const groupItems = [
    { id: "qa-group-1", title: "Единый ритм группы", status: "in_progress", progress: 70 },
    { id: "qa-group-2", title: "Вступление ансамбля", status: "planned", progress: 0 },
    { id: "qa-group-3", title: "Динамика исполнения", status: "planned", progress: 0 },
    { id: "qa-group-4", title: "Финальная остановка", status: "planned", progress: 0 },
  ];

  await prisma.studentMonthlyPlan.upsert({
    where: { crmStudentId_teacherUserId_month: { crmStudentId: CRM.student1, teacherUserId: QA_IDS.teacher1, month } },
    update: { goal: "Сыграть песню целиком", expectedResult: "Уверенное исполнение под метроном", items: individualItems, publishedSnapshot: individualItems, publishedAt: new Date(), publishedRevision: 1 },
    create: { id: QA_IDS.studentPlan, crmStudentId: CRM.student1, teacherUserId: QA_IDS.teacher1, month, goal: "Сыграть песню целиком", expectedResult: "Уверенное исполнение под метроном", items: individualItems, publishedSnapshot: individualItems, publishedAt: new Date(), publishedRevision: 1 },
  });
  await prisma.groupMonthlyPlan.upsert({
    where: { crmGroupId_teacherUserId_month: { crmGroupId: CRM.group1, teacherUserId: QA_IDS.teacher1, month } },
    update: { goal: "Сыграть композицию ансамблем", expectedResult: "Группа держит общий темп", items: groupItems, publishedSnapshot: groupItems, publishedAt: new Date(), publishedRevision: 1 },
    create: { id: QA_IDS.groupPlan, crmGroupId: CRM.group1, teacherUserId: QA_IDS.teacher1, month, goal: "Сыграть композицию ансамблем", expectedResult: "Группа держит общий темп", items: groupItems, publishedSnapshot: groupItems, publishedAt: new Date(), publishedRevision: 1 },
  });

  const topicPercents = [0, 70, 99, 100];
  for (const [index, percent] of topicPercents.entries()) {
    const topicId = `20000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`;
    await prisma.learningTopic.upsert({
      where: { id: topicId },
      update: { title: individualItems[index].title, progressPercent: percent, archivedAt: null },
      create: {
        id: topicId,
        directionId: guitar.id,
        crmStudentId: CRM.student1,
        title: individualItems[index].title,
        progressPercent: percent,
        legacyStatus: percent === 100 ? "done" : "active",
        createdById: QA_IDS.teacher1,
        responsibleTeacherId: QA_IDS.teacher1,
        legacySourceKey: `qa:topic:${index + 1}`,
        masteredAt: percent === 100 ? new Date() : null,
      },
    });
  }

  const learningTopics = [
    {
      id: QA_IDS.learningStudentTopic,
      crmStudentId: CRM.student1,
      crmGroupId: null,
      title: "Стабильный бой восьмыми",
      masteryCriteria: "Сыграть две минуты без остановки на 80 BPM",
      progressPercent: 45,
      legacySourceKey: "qa:v2-topic:student:rhythm",
    },
    {
      id: QA_IDS.learningStudentTopicSecond,
      crmStudentId: CRM.student1,
      crmGroupId: null,
      title: "Чистые переходы аккордов",
      masteryCriteria: "Не менее восьми чистых переходов из десяти",
      progressPercent: 0,
      legacySourceKey: "qa:v2-topic:student:chords",
    },
    {
      id: QA_IDS.learningGroupTopic,
      crmStudentId: null,
      crmGroupId: CRM.group1,
      title: "Единый ритм группы",
      masteryCriteria: "Группа играет куплет без расхождения с метрономом",
      progressPercent: 0,
      legacySourceKey: "qa:v2-topic:group:rhythm",
    },
  ];
  for (const topic of learningTopics) {
    await prisma.learningTopic.upsert({
      where: { id: topic.id },
      update: {
        directionId: guitar.id,
        crmStudentId: topic.crmStudentId,
        crmGroupId: topic.crmGroupId,
        title: topic.title,
        masteryCriteria: topic.masteryCriteria,
        progressPercent: topic.progressPercent,
        legacyStatus: "active",
        createdById: QA_IDS.teacher1,
        responsibleTeacherId: QA_IDS.teacher1,
        legacySourceKey: topic.legacySourceKey,
        masteryRewardSourceKey: null,
        masteredAt: null,
        archivedAt: null,
      },
      create: {
        ...topic,
        directionId: guitar.id,
        legacyStatus: "active",
        createdById: QA_IDS.teacher1,
        responsibleTeacherId: QA_IDS.teacher1,
      },
    });
  }

  const disposableAssignments = await prisma.learningHomeworkAssignment.findMany({
    where: {
      OR: [
        {
          topicId: {
            in: [
              QA_IDS.learningStudentTopic,
              QA_IDS.learningStudentTopicSecond,
              QA_IDS.learningGroupTopic,
            ],
          },
        },
        { idempotencyKey: { startsWith: "qa:fixture:homework:" } },
        { idempotencyKey: { startsWith: "e2e:homework-v2:" } },
      ],
    },
    select: {
      id: true,
      recipients: { select: { id: true } },
    },
  });
  const disposableRecipientIds = disposableAssignments.flatMap((assignment) =>
    assignment.recipients.map((recipient) => recipient.id),
  );
  if (disposableRecipientIds.length > 0) {
    await prisma.userNotification.deleteMany({
      where: {
        OR: disposableRecipientIds.map((recipientId) => ({
          dedupeKey: { contains: recipientId },
        })),
      },
    });
  }
  await prisma.learningHomeworkAssignment.deleteMany({
    where: { id: { in: disposableAssignments.map((assignment) => assignment.id) } },
  });
  await prisma.learningPlan.deleteMany({
    where: {
      directionId: guitar.id,
      month,
      OR: [
        { crmStudentId: CRM.student1 },
        { crmGroupId: CRM.group1 },
      ],
    },
  });

  await prisma.learningPlan.create({
    data: {
      id: QA_IDS.learningStudentPlan,
      directionId: guitar.id,
      crmStudentId: CRM.student1,
      month,
      currentVersionNumber: 1,
      publishedVersionNumber: 1,
      createdById: QA_IDS.teacher1,
      versions: {
        create: {
          id: QA_IDS.learningStudentPlanVersion,
          version: 1,
          goal: "Играть ровно под метроном",
          expectedResult: "Уверенно держать ритм и чисто менять аккорды",
          checkpoint: "Контроль на уроке",
          createdById: QA_IDS.teacher1,
          publishedAt: new Date(),
          topics: {
            create: [
              {
                id: "41000000-0000-4000-8000-000000000001",
                topicId: QA_IDS.learningStudentTopic,
                sortOrder: 0,
                titleSnapshot: "Стабильный бой восьмыми",
                masteryCriteriaSnapshot: "Сыграть две минуты без остановки на 80 BPM",
              },
              {
                id: "41000000-0000-4000-8000-000000000002",
                topicId: QA_IDS.learningStudentTopicSecond,
                sortOrder: 1,
                titleSnapshot: "Чистые переходы аккордов",
                masteryCriteriaSnapshot: "Не менее восьми чистых переходов из десяти",
              },
            ],
          },
        },
      },
    },
  });
  await prisma.learningPlan.create({
    data: {
      id: QA_IDS.learningGroupPlan,
      directionId: guitar.id,
      crmGroupId: CRM.group1,
      month,
      currentVersionNumber: 1,
      publishedVersionNumber: 1,
      createdById: QA_IDS.teacher1,
      versions: {
        create: {
          id: QA_IDS.learningGroupPlanVersion,
          version: 1,
          goal: "Играть композицию ансамблем",
          expectedResult: "Участники держат единый темп",
          checkpoint: "Контроль на групповом уроке",
          createdById: QA_IDS.teacher1,
          publishedAt: new Date(),
          topics: {
            create: {
              id: "41000000-0000-4000-8000-000000000003",
              topicId: QA_IDS.learningGroupTopic,
              sortOrder: 0,
              titleSnapshot: "Единый ритм группы",
              masteryCriteriaSnapshot: "Группа играет куплет без расхождения с метрономом",
            },
          },
        },
      },
    },
  });

  await prisma.learningHomeworkAssignment.create({
    data: {
      id: QA_IDS.learningIndividualAssignment,
      topicId: QA_IDS.learningStudentTopic,
      sourceLessonId: CRM.individualEditable,
      instructions: "Подготовить бой восьмыми и показать на следующем уроке",
      idempotencyKey: "qa:fixture:homework:individual",
      createdById: QA_IDS.teacher1,
      recipients: {
        create: {
          id: "42000000-0000-4000-8000-000000000001",
          crmStudentId: CRM.student1,
          studentUserId: QA_IDS.student1,
          state: "waiting_review",
          currentCycle: 1,
          attempts: {
            create: {
              id: "43000000-0000-4000-8000-000000000001",
              attemptNumber: 1,
              cycleNumber: 1,
              versionInCycle: 1,
              submissionMode: "ready_for_lesson",
              status: "waiting_review",
              submittedById: QA_IDS.student1,
              idempotencyKey: "qa:fixture:homework:individual:attempt:1",
            },
          },
        },
      },
    },
  });
  await prisma.learningHomeworkAssignment.create({
    data: {
      id: QA_IDS.learningGroupAssignment,
      topicId: QA_IDS.learningGroupTopic,
      sourceLessonId: CRM.groupEditable,
      instructions: "Подготовить общую партию под метроном и показать на уроке",
      idempotencyKey: "qa:fixture:homework:group",
      createdById: QA_IDS.teacher1,
      recipients: {
        create: [
          {
            id: "42000000-0000-4000-8000-000000000002",
            crmStudentId: CRM.student1,
            studentUserId: QA_IDS.student1,
            state: "waiting_review",
            currentCycle: 1,
            attempts: {
              create: {
                id: "43000000-0000-4000-8000-000000000002",
                attemptNumber: 1,
                cycleNumber: 1,
                versionInCycle: 1,
                submissionMode: "ready_for_lesson",
                status: "waiting_review",
                submittedById: QA_IDS.student1,
                idempotencyKey: "qa:fixture:homework:group:student-1:attempt:1",
              },
            },
          },
          {
            id: "42000000-0000-4000-8000-000000000003",
            crmStudentId: CRM.student2,
            studentUserId: QA_IDS.student2,
            state: "waiting_review",
            currentCycle: 1,
            attempts: {
              create: {
                id: "43000000-0000-4000-8000-000000000003",
                attemptNumber: 1,
                cycleNumber: 1,
                versionInCycle: 1,
                submissionMode: "ready_for_lesson",
                status: "waiting_review",
                submittedById: QA_IDS.student2,
                idempotencyKey: "qa:fixture:homework:group:student-2:attempt:1",
              },
            },
          },
          {
            id: "42000000-0000-4000-8000-000000000004",
            crmStudentId: CRM.student3,
            studentUserId: QA_IDS.student3,
            state: "assigned",
            currentCycle: 1,
          },
        ],
      },
    },
  });

  const qaClassIds = [
    CRM.individualPrevious,
    CRM.individualEditable,
    CRM.individualUpcoming,
    CRM.groupPrevious,
    CRM.groupEditable,
    CRM.groupUpcoming,
  ];
  await prisma.crmSyncConflict.deleteMany({ where: { crmClassId: { in: qaClassIds } } });
  await prisma.crmOutboxEvent.deleteMany({
    where: { aggregateType: "offline_lesson", aggregateId: { in: qaClassIds } },
  });
  await prisma.offlineLessonReport.deleteMany({ where: { crmClassId: { in: qaClassIds } } });
  await prisma.offlineLessonProjection.deleteMany({ where: { crmClassId: { in: qaClassIds } } });

  const checks = [
    { crmClassId: CRM.individualPrevious, crmStudentId: CRM.student1, attendanceStatus: "present", homeworkStatus: "partially_completed", homeworkCompletionPercent: 70, lessonPoints: 100 },
    { crmClassId: CRM.individualEditable, crmStudentId: CRM.student1, attendanceStatus: "present", homeworkStatus: "partially_completed", homeworkCompletionPercent: 70, lessonPoints: 100 },
    { crmClassId: CRM.groupPrevious, crmStudentId: CRM.student1, attendanceStatus: "present", homeworkStatus: "completed", homeworkCompletionPercent: 100, lessonPoints: 100 },
    { crmClassId: CRM.groupPrevious, crmStudentId: CRM.student2, attendanceStatus: "present", homeworkStatus: "partially_completed", homeworkCompletionPercent: 70, lessonPoints: 0 },
    { crmClassId: CRM.groupPrevious, crmStudentId: CRM.student3, attendanceStatus: "unexcused_absence", homeworkStatus: "not_completed", homeworkCompletionPercent: 0, lessonPoints: 0 },
    { crmClassId: CRM.groupEditable, crmStudentId: CRM.student1, attendanceStatus: "present", homeworkStatus: "completed", homeworkCompletionPercent: 100, lessonPoints: 100 },
    { crmClassId: CRM.groupEditable, crmStudentId: CRM.student2, attendanceStatus: "present", homeworkStatus: "partially_completed", homeworkCompletionPercent: 70, lessonPoints: 0 },
    { crmClassId: CRM.groupEditable, crmStudentId: CRM.student3, attendanceStatus: "unexcused_absence", homeworkStatus: "not_completed", homeworkCompletionPercent: 0, lessonPoints: 0 },
  ];
  for (const check of checks) {
    await prisma.offlineLessonStudentCheck.upsert({
      where: { crmClassId_crmStudentId: { crmClassId: check.crmClassId, crmStudentId: check.crmStudentId } },
      update: {
        ...check,
        teacherUserId: QA_IDS.teacher1,
        reviewedHomeworkCrmClassId: null,
        planTopicUpdates: [],
        rewardsAppliedAt: null,
        syncRevision: 0,
        syncStatus: "synced",
        lastSyncError: null,
        syncedAt: null,
      },
      create: { ...check, teacherUserId: QA_IDS.teacher1 },
    });
  }

  const activeEconomicEpoch = await prisma.economicEpoch.findFirst({
    where: { status: "active" },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });

  await prisma.weeklyStreakProtection.deleteMany({
    where: {
      studentId: { in: [QA_IDS.student1, QA_IDS.student2, QA_IDS.student3] },
      source: "curator",
    },
  });

  for (const studentId of [QA_IDS.student1, QA_IDS.student2, QA_IDS.student3]) {
    await prisma.studentCoinBalance.upsert({
      where: { studentId },
      update: { balance: 200, economicEpochId: activeEconomicEpoch?.id ?? null },
      create: { studentId, balance: 200, economicEpochId: activeEconomicEpoch?.id ?? null },
    });
    await prisma.maestroCoinTransaction.upsert({
      where: { sourceKey: `qa:startup-coins:${studentId}` },
      update: { amount: 200, balanceBefore: 0, balanceAfter: 200, economicEpochId: null },
      create: {
        studentId,
        amount: 200,
        transactionType: "earn",
        reason: "Стартовый баланс QA",
        sourceType: "manual",
        sourceKey: `qa:startup-coins:${studentId}`,
        createdById: QA_IDS.admin,
        balanceBefore: 0,
        balanceAfter: 200,
      },
    });
  }

  for (const [studentIndex, studentId] of [QA_IDS.student1, QA_IDS.student2, QA_IDS.student3].entries()) {
    for (let week = 0; week < 8; week += 1) {
      const sourceKey = `qa:league:${studentIndex + 1}:${week}`;
      await prisma.leagueXpEvent.upsert({
        where: { sourceKey },
        update: {
          amount: Math.max(5, 40 - studentIndex * 7 - week * 2),
          createdAt: mondayWeeksAgo(week),
          economicEpochId: null,
        },
        create: {
          studentId,
          amount: Math.max(5, 40 - studentIndex * 7 - week * 2),
          sourceType: "offline_lesson",
          sourceKey,
          description: `QA активность, неделя ${week + 1}`,
          awardedById: QA_IDS.teacher1,
          createdAt: mondayWeeksAgo(week),
        },
      });
    }
  }

  await prisma.pointsTransaction.upsert({
    where: { sourceKey: "qa:legacy-points:student-1" },
    update: { amount: 350, economicEpochId: null },
    create: { studentId: QA_IDS.student1, amount: 350, reason: "Legacy-баллы до новой эпохи", sourceKey: "qa:legacy-points:student-1", awardedBy: QA_IDS.admin },
  });

  console.log("QA Learning Platform seed complete.");
  console.table(users.map((user) => ({ login: user.login, roleId: user.roleId, active: user.isActive })));
  console.log(`Shared password: ${QA_PASSWORD}`);
  console.log(`CRM fixtures: ${Object.values(CRM).join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
