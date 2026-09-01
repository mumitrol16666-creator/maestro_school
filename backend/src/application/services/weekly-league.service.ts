import {
  Prisma,
  type LeagueXpSourceType,
  type WeeklyLeagueAwardType,
} from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { addMaestroCoins, creditMaestroCoinsInTransaction } from "./coins.service.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";
import {
  calculateLeagueRankDelta,
  courseHomeworkLeagueXp,
  getAqtobeWeekRange,
  lessonAttendanceXpForWeek,
  LEGACY_WEEKLY_LEAGUE_PRIZES,
  nextWeeklyStreak,
  preparedTestLeagueXp,
  weeklyLeagueFinalizesAt,
  weeklyLeaguePhase,
  WEEKLY_HOMEWORK_DIRECTION_LIMIT,
  rankLeagueEvents,
  WEEKLY_LESSON_ATTENDANCE_LIMIT,
  WEEKLY_LESSON_ATTENDANCE_COINS,
  WEEKLY_LESSON_ATTENDANCE_XP,
  WEEKLY_LEAGUE_GOAL_COINS,
  WEEKLY_LEAGUE_GOAL_XP,
  WEEKLY_LEAGUE_PRIZES,
  WEEKLY_LEAGUE_RULES,
  WEEKLY_LEAGUE_RULES_VERSION,
  WEEKLY_PREPARED_TEST_LIMIT,
  WEEKLY_TEACHER_BONUS_LIMIT,
  WEEKLY_STREAK_MILESTONES,
  weeklyStreakMilestone,
  weeklyLeagueSourceLabels,
  weeklyLeagueWeekLabel,
  type AqtobeWeekRange,
} from "./weekly-league-policy.js";

const HOMEWORK_SOURCE_TYPES: LeagueXpSourceType[] = [
  "learning_homework",
  "course_homework",
  "online_assignment",
];

function weeklyFinalizationLockKey(epochId: string, weekKey: string) {
  return `weekly-league-finalize:${epochId}:${weekKey}`;
}

async function listRankedWeek(
  range: AqtobeWeekRange,
  economicEpochId?: string,
  recordedBefore?: Date,
) {
  const events = await prisma.leagueXpEvent.findMany({
    where: {
      ...(economicEpochId ? { economicEpochId } : {}),
      ...(recordedBefore ? { recordedAt: { lte: recordedBefore } } : {}),
      createdAt: { gte: range.start, lt: range.end },
      student: {
        leagueEligible: true,
        isActive: true,
        deletedAt: null,
        role: { slug: "student" },
      },
    },
    select: {
      studentId: true,
      amount: true,
      sourceType: true,
      createdAt: true,
      recordedAt: true,
      description: true,
      directionId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });
  return { events, ranking: rankLeagueEvents(events) };
}

export async function awardLeagueXp(params: {
  studentId: string;
  amount: number;
  sourceType: LeagueXpSourceType;
  sourceKey: string;
  description: string;
  awardedById?: string | null;
  eventAt?: Date;
  directionId?: string | null;
}) {
  if (params.amount <= 0) {
    return { awarded: false as const, status: "zero_amount" as const, amount: 0 };
  }
  const eventAt = params.eventAt ?? new Date();
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;
  if (economicEpoch) {
    throw new ConflictError(
      "XP новой экономики начисляется только через защищённое правило источника",
      "WEEKLY_XP_POLICY_REQUIRED",
    );
  }
  const student = await prisma.user.findFirst({
    where: {
      id: params.studentId,
      deletedAt: null,
      isActive: true,
      leagueEligible: true,
      role: { slug: "student" },
    },
    select: { id: true },
  });
  if (!student) {
    return { awarded: false as const, status: "not_eligible" as const, amount: 0 };
  }

  const existing = await prisma.leagueXpEvent.findUnique({
    where: { sourceKey: params.sourceKey },
    select: { id: true, amount: true },
  });
  if (existing) {
    return {
      awarded: false as const,
      status: "already_awarded" as const,
      amount: existing.amount,
    };
  }

  try {
    const event = await prisma.leagueXpEvent.create({
      data: {
        economicEpochId: null,
        studentId: params.studentId,
        directionId: params.directionId ?? null,
        amount: params.amount,
        sourceType: params.sourceType,
        sourceKey: params.sourceKey,
        description: params.description.trim().slice(0, 512),
        awardedById: params.awardedById ?? null,
        createdAt: eventAt,
      },
    });
    return {
      awarded: true as const,
      status: "awarded" as const,
      amount: params.amount,
      eventId: event.id,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { awarded: false as const, status: "already_awarded" as const, amount: 0 };
    }
    throw error;
  }
}

const LESSON_ATTENDANCE_SOURCE_TYPES: LeagueXpSourceType[] = [
  "offline_lesson",
  "online_lesson",
];

export type LessonAttendanceXpPreviewStatus =
  | "will_award"
  | "weekly_limit"
  | "already_awarded"
  | "not_linked"
  | "not_eligible"
  | "economy_disabled";

export async function previewOfflineLessonAttendanceXp(params: {
  crmClassId: string;
  crmStudentIds: string[];
  eventAt: Date;
  rewardsEnabled: boolean;
}) {
  const crmStudentIds = [...new Set(params.crmStudentIds.filter(Boolean))];
  if (!crmStudentIds.length) return [];
  const range = getAqtobeWeekRange(params.eventAt);
  const economicEpoch = params.rewardsEnabled && rewardEconomyV2AppliesToEvent(params.eventAt)
    ? await requireActiveEconomicEpochForEvent(params.eventAt)
    : null;
  const sourceKeys = crmStudentIds.map(
    (crmStudentId) => `offline-lesson:${params.crmClassId}:${crmStudentId}`,
  );
  const students = await prisma.user.findMany({
    where: { crmStudentId: { in: crmStudentIds }, deletedAt: null },
    select: {
      id: true,
      crmStudentId: true,
      isActive: true,
      leagueEligible: true,
      role: { select: { slug: true } },
    },
  });
  const studentByCrmId = new Map(
    students
      .filter((student): student is typeof student & { crmStudentId: string } => Boolean(student.crmStudentId))
      .map((student) => [student.crmStudentId, student]),
  );
  const studentIds = students.map((student) => student.id);
  const [weekEvents, sourceEvents] = await Promise.all([
    studentIds.length
      ? prisma.leagueXpEvent.groupBy({
          by: ["studentId"],
          where: {
            economicEpochId: economicEpoch?.id ?? null,
            studentId: { in: studentIds },
            sourceType: { in: LESSON_ATTENDANCE_SOURCE_TYPES },
            createdAt: { gte: range.start, lt: range.end },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.leagueXpEvent.findMany({
      where: { sourceKey: { in: sourceKeys } },
      select: { studentId: true, sourceKey: true, amount: true },
    }),
  ]);
  const countByStudent = new Map(weekEvents.map((event) => [event.studentId, event._count._all]));
  const sourceEventByKey = new Map(sourceEvents.map((event) => [event.sourceKey, event]));

  return crmStudentIds.map((crmStudentId) => {
    const sourceKey = `offline-lesson:${params.crmClassId}:${crmStudentId}`;
    const student = studentByCrmId.get(crmStudentId);
    const existing = sourceEventByKey.get(sourceKey);
    const awardedLessonCount = student ? countByStudent.get(student.id) ?? 0 : 0;
    let status: LessonAttendanceXpPreviewStatus;
    let amount = 0;
    if (existing) {
      status = "already_awarded";
      amount = existing.amount;
    } else if (!student || student.role.slug !== "student") {
      status = "not_linked";
    } else if (!student.isActive || !student.leagueEligible) {
      status = "not_eligible";
    } else if (!params.rewardsEnabled) {
      status = "economy_disabled";
    } else {
      amount = lessonAttendanceXpForWeek(awardedLessonCount);
      status = amount > 0 ? "will_award" : "weekly_limit";
    }
    return {
      crmStudentId,
      studentUserId: student?.id ?? null,
      status,
      amount,
      awardedLessonCount,
      weeklyLimit: WEEKLY_LESSON_ATTENDANCE_LIMIT,
      sourceKey,
      weekKey: range.key,
    };
  });
}

export async function awardLessonAttendanceXp(params: {
  studentId: string;
  sourceType: "offline_lesson" | "online_lesson";
  sourceKey: string;
  description: string;
  eventAt: Date;
  awardedById?: string | null;
  crmStudentId?: string;
}) {
  const range = getAqtobeWeekRange(params.eventAt);
  const economicEpoch = rewardEconomyV2AppliesToEvent(params.eventAt)
    ? await requireActiveEconomicEpochForEvent(params.eventAt)
    : null;
  if (!economicEpoch) {
    return awardLeagueXp({
      studentId: params.studentId,
      amount: WEEKLY_LESSON_ATTENDANCE_XP,
      sourceType: params.sourceType,
      sourceKey: params.sourceKey,
      description: params.description,
      awardedById: params.awardedById,
      eventAt: params.eventAt,
    });
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(economicEpoch.id, range.key)}))`;
    const lockKey = `weekly-lesson-attendance:${range.key}:${params.studentId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const student = await tx.user.findFirst({
      where: {
        id: params.studentId,
        ...(params.crmStudentId ? { crmStudentId: params.crmStudentId } : {}),
        deletedAt: null,
        isActive: true,
        leagueEligible: true,
        role: { slug: "student" },
      },
      select: { id: true },
    });
    if (!student) {
      return { awarded: false as const, status: "not_eligible" as const, amount: 0 };
    }
    await tx.weeklyLeagueActivityEvent.upsert({
      where: { sourceKey: `weekly-activity:${economicEpoch.id}:${params.sourceKey}` },
      create: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        activityType: "lesson_attendance",
        sourceKey: `weekly-activity:${economicEpoch.id}:${params.sourceKey}`,
        occurredAt: params.eventAt,
      },
      update: {},
    });
    const duplicate = await tx.leagueXpEvent.findUnique({
      where: { sourceKey: params.sourceKey },
      select: { id: true, amount: true },
    });
    if (duplicate) {
      return {
        awarded: false as const,
        status: "already_awarded" as const,
        amount: duplicate.amount,
        coins: 0,
      };
    }
    const awardedLessonCount = await tx.leagueXpEvent.count({
      where: {
        economicEpochId: economicEpoch?.id ?? null,
        studentId: params.studentId,
        sourceType: { in: LESSON_ATTENDANCE_SOURCE_TYPES },
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    const amount = lessonAttendanceXpForWeek(awardedLessonCount);
    if (amount <= 0) {
      return { awarded: false as const, status: "weekly_limit" as const, amount: 0, coins: 0 };
    }
    const finalizedSnapshot = await tx.weeklyLeagueSnapshot.findUnique({
      where: {
        economicEpochId_weekStart: {
          economicEpochId: economicEpoch.id,
          weekStart: range.start,
        },
      },
      select: { id: true },
    });
    const event = await tx.leagueXpEvent.create({
      data: {
        economicEpochId: economicEpoch?.id ?? null,
        studentId: params.studentId,
        amount: WEEKLY_LESSON_ATTENDANCE_XP,
        sourceType: params.sourceType,
        sourceKey: params.sourceKey,
        description: params.description,
        awardedById: params.awardedById ?? null,
        createdAt: params.eventAt,
      },
      select: { id: true },
    });
    if (finalizedSnapshot) {
      return {
        awarded: false as const,
        status: "recorded_after_finalization" as const,
        amount: 0,
        coins: 0,
        eventId: event.id,
      };
    }
    const coinResult = await creditMaestroCoinsInTransaction(tx, {
      economicEpochId: economicEpoch.id,
      studentId: params.studentId,
      amount: WEEKLY_LESSON_ATTENDANCE_COINS,
      reason: "Подтверждённое посещение занятия",
      sourceType: params.sourceType,
      sourceKey: `weekly-attendance-coins:${economicEpoch.id}:${params.sourceKey}`,
      createdById: params.awardedById ?? null,
      eventAt: params.eventAt,
    });
    return {
      awarded: true as const,
      status: "awarded" as const,
      amount: WEEKLY_LESSON_ATTENDANCE_XP,
      coins: coinResult.awarded ? WEEKLY_LESSON_ATTENDANCE_COINS : 0,
      eventId: event.id,
    };
  });
}

export async function awardOfflineLessonAttendanceXp(params: {
  studentId: string;
  crmStudentId: string;
  crmClassId: string;
  eventAt: Date;
  awardedById?: string | null;
}) {
  return awardLessonAttendanceXp({
    studentId: params.studentId,
    crmStudentId: params.crmStudentId,
    sourceType: "offline_lesson",
    sourceKey: `offline-lesson:${params.crmClassId}:${params.crmStudentId}`,
    description: "Подтверждённое посещение урока с преподавателем",
    eventAt: params.eventAt,
    awardedById: params.awardedById,
  });
}

export async function awardHomeworkAcceptedXp(params: {
  studentId: string;
  directionId: string | null | undefined;
  sourceType: "learning_homework" | "course_homework" | "online_assignment";
  sourceKey: string;
  description: string;
  attemptNumber: number;
  eventAt?: Date;
  awardedById?: string | null;
}) {
  const eventAt = params.eventAt ?? new Date();
  const amount = courseHomeworkLeagueXp(params.attemptNumber);
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;
  if (!economicEpoch) {
    return awardLeagueXp({
      studentId: params.studentId,
      directionId: params.directionId,
      amount,
      sourceType: params.sourceType,
      sourceKey: params.sourceKey,
      description: params.description,
      awardedById: params.awardedById,
      eventAt,
    });
  }
  if (!params.directionId) {
    return { awarded: false as const, status: "direction_missing" as const, amount: 0 };
  }
  const range = getAqtobeWeekRange(eventAt);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(economicEpoch.id, range.key)}))`;
    const lockKey = `weekly-homework:${range.key}:${params.studentId}:${params.directionId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const eligible = await tx.user.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        isActive: true,
        leagueEligible: true,
        role: { slug: "student" },
      },
      select: { id: true },
    });
    if (!eligible) {
      return { awarded: false as const, status: "not_eligible" as const, amount: 0 };
    }
    await tx.weeklyLeagueActivityEvent.upsert({
      where: { sourceKey: `weekly-activity:${economicEpoch.id}:${params.sourceKey}` },
      create: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        activityType: "homework_accepted",
        sourceKey: `weekly-activity:${economicEpoch.id}:${params.sourceKey}`,
        occurredAt: eventAt,
      },
      update: {},
    });
    const duplicate = await tx.leagueXpEvent.findUnique({
      where: { sourceKey: params.sourceKey },
      select: { id: true, amount: true },
    });
    if (duplicate) {
      return {
        awarded: false as const,
        status: "already_awarded" as const,
        amount: duplicate.amount,
      };
    }
    const awardedCount = await tx.leagueXpEvent.count({
      where: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        directionId: params.directionId,
        sourceType: { in: HOMEWORK_SOURCE_TYPES },
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    if (awardedCount >= WEEKLY_HOMEWORK_DIRECTION_LIMIT) {
      return { awarded: false as const, status: "weekly_limit" as const, amount: 0 };
    }
    const event = await tx.leagueXpEvent.create({
      data: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        directionId: params.directionId,
        amount,
        sourceType: params.sourceType,
        sourceKey: params.sourceKey,
        description: params.description,
        awardedById: params.awardedById ?? null,
        createdAt: eventAt,
      },
      select: { id: true },
    });
    return { awarded: true as const, status: "awarded" as const, amount, eventId: event.id };
  });
}

export async function awardPreparedTestXp(params: {
  studentId: string;
  testId: string;
  attemptNumber: number;
  testTitle: string;
  eventAt?: Date;
}) {
  const eventAt = params.eventAt ?? new Date();
  const amount = preparedTestLeagueXp(params.attemptNumber);
  const sourceKey = `prepared-test:${params.studentId}:${params.testId}`;
  const description = params.attemptNumber === 1
    ? `Тест «${params.testTitle}» пройден с первой попытки`
    : `Тест «${params.testTitle}» пройден с ${params.attemptNumber}-й попытки`;
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;
  if (!economicEpoch) {
    return awardLeagueXp({
      studentId: params.studentId,
      amount,
      sourceType: "prepared_test",
      sourceKey,
      description,
      eventAt,
    });
  }
  const range = getAqtobeWeekRange(eventAt);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(economicEpoch.id, range.key)}))`;
    const lockKey = `weekly-prepared-test:${range.key}:${params.studentId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const duplicate = await tx.leagueXpEvent.findUnique({
      where: { sourceKey },
      select: { id: true, amount: true },
    });
    if (duplicate) {
      return {
        awarded: false as const,
        status: "already_awarded" as const,
        amount: duplicate.amount,
      };
    }
    const eligible = await tx.user.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        isActive: true,
        leagueEligible: true,
        role: { slug: "student" },
      },
      select: { id: true },
    });
    if (!eligible) {
      return { awarded: false as const, status: "not_eligible" as const, amount: 0 };
    }
    const awardedCount = await tx.leagueXpEvent.count({
      where: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        sourceType: "prepared_test",
        createdAt: { gte: range.start, lt: range.end },
      },
    });
    if (awardedCount >= WEEKLY_PREPARED_TEST_LIMIT) {
      return { awarded: false as const, status: "weekly_limit" as const, amount: 0 };
    }
    const event = await tx.leagueXpEvent.create({
      data: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        amount,
        sourceType: "prepared_test",
        sourceKey,
        description,
        createdAt: eventAt,
      },
      select: { id: true },
    });
    return { awarded: true as const, status: "awarded" as const, amount, eventId: event.id };
  });
}

export async function awardTeacherLeagueBonus(params: {
  teacherId: string;
  studentId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  if (params.amount < 1 || params.amount > WEEKLY_TEACHER_BONUS_LIMIT) {
    throw new BadRequestError(`За один бонус можно начислить от 1 до ${WEEKLY_TEACHER_BONUS_LIMIT} XP`);
  }
  const reason = params.reason.trim();
  if (reason.length < 3) throw new BadRequestError("Укажите причину бонуса");

  const student = await prisma.user.findFirst({
    where: { id: params.studentId, role: { slug: "student" }, deletedAt: null },
    select: { id: true, crmStudentId: true },
  });
  if (!student) throw new NotFoundError("Student");

  const teachingLink = await prisma.onlineLessonRequest.findFirst({
    where: { teacherId: params.teacherId, studentId: params.studentId },
    select: { id: true },
  });
  const offlineLink = !teachingLink && student.crmStudentId
    ? await prisma.offlineLessonStudentCheck.findFirst({
        where: { teacherUserId: params.teacherId, crmStudentId: student.crmStudentId },
        select: { id: true },
      })
    : null;
  if (!teachingLink && !offlineLink) {
    throw new BadRequestError("Бонус можно начислять только своему ученику");
  }

  const range = getAqtobeWeekRange();
  const eventAt = new Date();
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;
  const sourceKey = `teacher-bonus:${params.teacherId}:${params.idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    if (economicEpoch) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(economicEpoch.id, range.key)}))`;
    }
    const lockKey = `weekly-league-bonus:${range.key}:${params.teacherId}:${params.studentId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const duplicate = await tx.leagueXpEvent.findUnique({
      where: { sourceKey },
      select: { id: true },
    });
    if (duplicate) return { awarded: false as const };

    const eligibleStudent = await tx.user.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        isActive: true,
        leagueEligible: true,
        role: { slug: "student" },
      },
      select: { id: true },
    });
    if (!eligibleStudent) return { awarded: false as const };

    const alreadyAwarded = await tx.leagueXpEvent.aggregate({
      where: {
        economicEpochId: economicEpoch?.id ?? null,
        studentId: params.studentId,
        awardedById: params.teacherId,
        sourceType: "teacher_bonus",
        createdAt: { gte: range.start, lt: range.end },
      },
      _sum: { amount: true },
    });
    const remainder = WEEKLY_TEACHER_BONUS_LIMIT - (alreadyAwarded._sum.amount ?? 0);
    if (params.amount > remainder) {
      throw new BadRequestError(
        remainder > 0
          ? `На этой неделе этому ученику можно добавить ещё ${remainder} XP`
          : "Лимит бонусов этому ученику на неделю уже использован",
      );
    }

    const event = await tx.leagueXpEvent.create({
      data: {
        economicEpochId: economicEpoch?.id ?? null,
        studentId: params.studentId,
        amount: params.amount,
        sourceType: "teacher_bonus",
        sourceKey,
        description: reason,
        awardedById: params.teacherId,
        createdAt: eventAt,
      },
      select: { id: true },
    });
    return { awarded: true as const, eventId: event.id };
  });
}

type LeagueBreakdown = Array<{
  sourceType: LeagueXpSourceType;
  label: string;
  xp: number;
}>;

function breakdownFromEvents(events: Array<{ sourceType: LeagueXpSourceType; amount: number }>) {
  return [...new Set(events.map((event) => event.sourceType))]
    .map((sourceType) => ({
      sourceType,
      label: weeklyLeagueSourceLabels[sourceType],
      xp: events
        .filter((event) => event.sourceType === sourceType)
        .reduce((total, event) => total + event.amount, 0),
    }))
    .sort((left, right) => right.xp - left.xp);
}

function snapshotBreakdown(value: Prisma.JsonValue): LeagueBreakdown {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const sourceType = "sourceType" in item ? item.sourceType : null;
    const xp = "xp" in item ? item.xp : null;
    if (typeof sourceType !== "string" || typeof xp !== "number") return [];
    if (!(sourceType in weeklyLeagueSourceLabels)) return [];
    return [{
      sourceType: sourceType as LeagueXpSourceType,
      label: weeklyLeagueSourceLabels[sourceType as LeagueXpSourceType],
      xp,
    }];
  });
}

function snapshotCoinBreakdown(value: Prisma.JsonValue) {
  const empty = { attendance: 0, placement: 0, personalGoal: 0, milestone: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  return Object.fromEntries(
    Object.entries(empty).map(([key]) => [
      key,
      key in value && typeof value[key as keyof typeof value] === "number"
        ? value[key as keyof typeof value]
        : 0,
    ]),
  ) as typeof empty;
}

function snapshotMilestoneWeeks(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

export async function getWeeklyLeagueOverview(
  viewerStudentId: string | undefined,
  weekOffset = 0,
  now = new Date(),
) {
  const normalizedOffset = Math.min(12, Math.max(0, Math.trunc(weekOffset)));
  const range = getAqtobeWeekRange(now, normalizedOffset);
  const previousRange = getAqtobeWeekRange(now, normalizedOffset + 1);
  const economicEpoch = rewardEconomyV2AppliesToEvent(now)
    ? await requireActiveEconomicEpochForEvent(now)
    : null;
  const [
    snapshot,
    previousSnapshot,
    dynamicWeek,
    dynamicPreviousWeek,
    awards,
    viewer,
    viewerStreak,
    viewerMilestones,
    viewerAttendanceCoinRows,
  ] = await Promise.all([
    economicEpoch
      ? prisma.weeklyLeagueSnapshot.findUnique({
          where: {
            economicEpochId_weekStart: {
              economicEpochId: economicEpoch.id,
              weekStart: range.start,
            },
          },
          include: { entries: { orderBy: { position: "asc" } } },
        })
      : Promise.resolve(null),
    economicEpoch
      ? prisma.weeklyLeagueSnapshot.findUnique({
          where: {
            economicEpochId_weekStart: {
              economicEpochId: economicEpoch.id,
              weekStart: previousRange.start,
            },
          },
          include: { entries: { orderBy: { position: "asc" } } },
        })
      : Promise.resolve(null),
    listRankedWeek(range, economicEpoch?.id),
    listRankedWeek(previousRange, economicEpoch?.id),
    prisma.weeklyLeagueAward.findMany({
      where: {
        weekStart: range.start,
        ...(economicEpoch ? { economicEpochId: economicEpoch.id } : {}),
      },
      select: { studentId: true, coins: true, awardType: true },
    }),
    viewerStudentId
      ? prisma.user.findFirst({
          where: { id: viewerStudentId, role: { slug: "student" }, deletedAt: null },
          select: { id: true, leagueEligible: true, isActive: true },
        })
      : Promise.resolve(null),
    economicEpoch && viewerStudentId
      ? prisma.weeklyStreakState.findUnique({
          where: {
            economicEpochId_studentId: {
              economicEpochId: economicEpoch.id,
              studentId: viewerStudentId,
            },
          },
        })
      : Promise.resolve(null),
    economicEpoch && viewerStudentId
      ? prisma.weeklyStreakMilestone.findMany({
          where: { economicEpochId: economicEpoch.id, studentId: viewerStudentId },
          orderBy: { milestoneWeeks: "asc" },
        })
      : Promise.resolve([]),
    viewerStudentId
      ? prisma.maestroCoinTransaction.findMany({
          where: {
            studentId: viewerStudentId,
            ...(economicEpoch ? { economicEpochId: economicEpoch.id } : {}),
            sourceType: { in: ["offline_lesson", "online_lesson"] },
            amount: { gt: 0 },
            createdAt: { gte: range.start, lt: range.end },
          },
          select: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const ranking = snapshot
    ? snapshot.entries.map((entry) => ({
        position: entry.position,
        studentId: entry.studentId,
        displayName: entry.displayName,
        xp: entry.xp,
        eventCount: entry.eventCount,
      }))
    : dynamicWeek.ranking;
  const previousRanking = previousSnapshot
    ? previousSnapshot.entries.map((entry) => ({
        position: entry.position,
        studentId: entry.studentId,
        displayName: entry.displayName,
        xp: entry.xp,
        eventCount: entry.eventCount,
      }))
    : dynamicPreviousWeek.ranking;
  const events = snapshot
    ? (await listRankedWeek(range, economicEpoch?.id, snapshot.finalizedAt)).events
    : dynamicWeek.events;

  const previousPositions = new Map(previousRanking.map((entry) => [entry.studentId, entry.position]));
  const awardCoins = new Map<string, number>();
  for (const award of awards) {
    awardCoins.set(award.studentId, (awardCoins.get(award.studentId) ?? 0) + award.coins);
  }

  const snapshotEntryByStudent = new Map(
    snapshot?.entries.map((entry) => [entry.studentId, entry]) ?? [],
  );
  const standings = ranking.map((entry) => ({
    position: entry.position,
    studentId: entry.studentId,
    displayName: entry.displayName,
    xp: entry.xp,
    eventCount: entry.eventCount,
    rankDelta: calculateLeagueRankDelta(entry.position, previousPositions.get(entry.studentId)),
    isCurrentStudent: entry.studentId === viewerStudentId,
    awardedCoins: snapshotEntryByStudent.get(entry.studentId)?.coinsAwarded
      ?? awardCoins.get(entry.studentId)
      ?? 0,
  }));

  const currentEntry = viewerStudentId
    ? standings.find((entry) => entry.studentId === viewerStudentId)
    : undefined;
  const viewerEvents = viewerStudentId
    ? events.filter((event) => event.studentId === viewerStudentId)
    : [];
  const viewerSnapshotEntry = viewerStudentId
    ? snapshotEntryByStudent.get(viewerStudentId)
    : undefined;
  const breakdown = viewerSnapshotEntry
    ? snapshotBreakdown(viewerSnapshotEntry.breakdown)
    : breakdownFromEvents(viewerEvents);
  const currentXp = currentEntry?.xp ?? 0;
  const leaguePrizes = economicEpoch ? WEEKLY_LEAGUE_PRIZES : LEGACY_WEEKLY_LEAGUE_PRIZES;
  const prize = currentEntry
    ? leaguePrizes.find((item) => item.position === currentEntry.position)
    : null;
  const attendanceCoins = viewerAttendanceCoinRows.reduce((sum, row) => sum + row.amount, 0);
  const projectedPlacementCoins = currentXp > 0 ? prize?.coins ?? 0 : 0;
  const projectedGoalCoins = currentXp >= WEEKLY_LEAGUE_GOAL_XP
    ? economicEpoch ? WEEKLY_LEAGUE_GOAL_COINS : 3
    : 0;
  const projectedRewardCoins = viewerSnapshotEntry?.coinsAwarded
    ?? (normalizedOffset === 0
      ? attendanceCoins + projectedPlacementCoins + projectedGoalCoins
      : awardCoins.get(viewerStudentId ?? "") ?? 0);
  const coinBreakdown = viewerSnapshotEntry
    ? snapshotCoinBreakdown(viewerSnapshotEntry.coinBreakdown)
    : {
        attendance: attendanceCoins,
        placement: projectedPlacementCoins,
        personalGoal: projectedGoalCoins,
        milestone: 0,
      };
  const earnedMilestoneWeeks = new Set(viewerMilestones.map((item) => item.milestoneWeeks));
  const streakMilestones = WEEKLY_STREAK_MILESTONES.map((milestone) => ({
    ...milestone,
    earned: earnedMilestoneWeeks.has(milestone.weeks),
    earnedAt: viewerMilestones.find((item) => item.milestoneWeeks === milestone.weeks)?.earnedAt ?? null,
  }));

  const previousXp = new Map(previousRanking.map((entry) => [entry.studentId, entry.xp]));
  const breakthrough = standings
    .map((entry) => ({
      ...entry,
      gain: previousXp.has(entry.studentId) ? entry.xp - (previousXp.get(entry.studentId) ?? 0) : 0,
    }))
    .filter((entry) => entry.gain > 0)
    .sort((left, right) => right.gain - left.gain || left.position - right.position)[0] ?? null;

  const phase = weeklyLeaguePhase({ range, now, hasSnapshot: Boolean(snapshot) });
  return {
    economyV2Enabled: Boolean(economicEpoch),
    week: {
      startAt: range.start,
      endAt: range.end,
      key: range.key,
      label: weeklyLeagueWeekLabel(range),
      isCurrent: normalizedOffset === 0,
      phase,
      positionsFinal: phase === "finalized",
      finalizesAt: weeklyLeagueFinalizesAt(range),
      secondsRemaining: normalizedOffset === 0
        ? Math.max(0, Math.floor((range.end.getTime() - now.getTime()) / 1000))
        : 0,
    },
    updatedAt: now,
    participantCount: standings.length,
    standings: standings.slice(0, 10),
    currentStudent: viewerStudentId ? {
      eligible: Boolean(viewer?.leagueEligible && viewer.isActive),
      position: currentEntry?.position ?? null,
      xp: currentXp,
      eventCount: currentEntry?.eventCount ?? 0,
      rankDelta: currentEntry?.rankDelta ?? null,
      goalXp: WEEKLY_LEAGUE_GOAL_XP,
      goalProgress: Math.min(100, Math.round(currentXp / WEEKLY_LEAGUE_GOAL_XP * 100)),
      streakWeeks: viewerSnapshotEntry?.streakWeeks ?? viewerStreak?.currentWeeks ?? 0,
      bestStreakWeeks: viewerStreak?.bestWeeks ?? viewerSnapshotEntry?.streakWeeks ?? 0,
      streakOutcome: viewerSnapshotEntry?.streakOutcome ?? null,
      projectedRewardCoins,
      coinBreakdown,
      streakMilestones,
      breakdown,
      recentEvents: viewerEvents
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, 8)
        .map((event) => ({
          sourceType: event.sourceType,
          label: weeklyLeagueSourceLabels[event.sourceType],
          description: event.description,
          xp: event.amount,
          createdAt: event.createdAt,
        })),
    } : null,
    highlights: {
      leader: standings[0] ?? null,
      breakthrough: breakthrough ? {
        studentId: breakthrough.studentId,
        displayName: breakthrough.displayName,
        gain: breakthrough.gain,
      } : null,
    },
    rules: WEEKLY_LEAGUE_RULES,
    prizes: {
      rewardsEnabled: true,
      placements: leaguePrizes,
      personalGoal: {
        xp: WEEKLY_LEAGUE_GOAL_XP,
        coins: economicEpoch ? WEEKLY_LEAGUE_GOAL_COINS : 3,
        label: "Личная цель",
      },
    },
  };
}

export async function getWeeklyLeagueHistory(
  viewerStudentId: string,
  params: { cursor?: Date; limit?: number; now?: Date } = {},
) {
  const now = params.now ?? new Date();
  const limit = Math.min(20, Math.max(1, Math.trunc(params.limit ?? 8)));
  if (!rewardEconomyV2AppliesToEvent(now)) {
    return {
      economyV2Enabled: false as const,
      items: [],
      nextCursor: null,
    };
  }

  const economicEpoch = await requireActiveEconomicEpochForEvent(now);
  const rows = await prisma.weeklyLeagueSnapshot.findMany({
    where: {
      economicEpochId: economicEpoch.id,
      ...(params.cursor ? { weekStart: { lt: params.cursor } } : {}),
      entries: { some: { studentId: viewerStudentId } },
    },
    orderBy: { weekStart: "desc" },
    take: limit + 1,
    include: {
      entries: {
        where: {
          OR: [
            { studentId: viewerStudentId },
            { position: { lte: 3 } },
          ],
        },
        orderBy: { position: "asc" },
      },
    },
  });
  const page = rows.slice(0, limit);

  return {
    economyV2Enabled: true as const,
    items: page.flatMap((snapshot) => {
      const viewerEntry = snapshot.entries.find((entry) => entry.studentId === viewerStudentId);
      if (!viewerEntry) return [];
      const range = getAqtobeWeekRange(snapshot.weekStart);
      return [{
        snapshotId: snapshot.id,
        week: {
          key: range.key,
          label: weeklyLeagueWeekLabel(range),
          startAt: snapshot.weekStart,
          endAt: snapshot.weekEnd,
          finalizedAt: snapshot.finalizedAt,
        },
        participantCount: snapshot.participantCount,
        position: viewerEntry.position,
        xp: viewerEntry.xp,
        eventCount: viewerEntry.eventCount,
        goalXp: viewerEntry.goalXp,
        goalMet: viewerEntry.goalMet,
        coinsAwarded: viewerEntry.coinsAwarded,
        coinBreakdown: snapshotCoinBreakdown(viewerEntry.coinBreakdown),
        streakWeeks: viewerEntry.streakWeeks,
        streakOutcome: viewerEntry.streakOutcome,
        milestonesEarned: snapshotMilestoneWeeks(viewerEntry.milestonesEarned),
        breakdown: snapshotBreakdown(viewerEntry.breakdown),
        topThree: snapshot.entries
          .filter((entry) => entry.position <= 3)
          .map((entry) => ({
            position: entry.position,
            displayName: entry.displayName,
            xp: entry.xp,
            coinsAwarded: entry.coinsAwarded,
            isCurrentStudent: entry.studentId === viewerStudentId,
          })),
      }];
    }),
    nextCursor: rows.length > limit
      ? page.at(-1)?.weekStart.toISOString() ?? null
      : null,
  };
}

export async function getAdminWeeklyLeagueOverview(weekOffset = 0, now = new Date()) {
  const normalizedOffset = Math.min(12, Math.max(0, Math.trunc(weekOffset)));
  const range = getAqtobeWeekRange(now, normalizedOffset);
  const economicEpoch = rewardEconomyV2AppliesToEvent(now)
    ? await requireActiveEconomicEpochForEvent(now)
    : null;
  const [overview, students, fullWeek, snapshot, protections, streakStates] = await Promise.all([
    getWeeklyLeagueOverview(undefined, normalizedOffset, now),
    prisma.user.findMany({
      where: { role: { slug: "student" }, deletedAt: null },
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        login: true,
        isActive: true,
        leagueEligible: true,
      },
    }),
    listRankedWeek(range, economicEpoch?.id),
    economicEpoch
      ? prisma.weeklyLeagueSnapshot.findUnique({
          where: {
            economicEpochId_weekStart: {
              economicEpochId: economicEpoch.id,
              weekStart: range.start,
            },
          },
          include: { entries: true },
        })
      : Promise.resolve(null),
    economicEpoch
      ? prisma.weeklyStreakProtection.findMany({
          where: {
            economicEpochId: economicEpoch.id,
            weekStart: range.start,
            revokedAt: null,
          },
          select: {
            id: true,
            studentId: true,
            source: true,
            category: true,
            comment: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    economicEpoch
      ? prisma.weeklyStreakState.findMany({
          where: { economicEpochId: economicEpoch.id },
          select: { studentId: true, currentWeeks: true, bestWeeks: true },
        })
      : Promise.resolve([]),
  ]);
  const ranking = snapshot?.entries ?? fullWeek.ranking;
  const standings = new Map(ranking.map((entry) => [entry.studentId, entry]));
  const protectionByStudent = new Map(protections.map((item) => [item.studentId, item]));
  const streakByStudent = new Map(streakStates.map((item) => [item.studentId, item]));
  return {
    ...overview,
    students: students.map((student) => ({
      ...student,
      fullName: `${student.firstName} ${student.lastName}`.trim(),
      effectiveEligible: student.isActive && student.leagueEligible,
      xp: standings.get(student.id)?.xp ?? 0,
      position: standings.get(student.id)?.position ?? null,
      streakWeeks: streakByStudent.get(student.id)?.currentWeeks ?? 0,
      bestStreakWeeks: streakByStudent.get(student.id)?.bestWeeks ?? 0,
      streakProtection: protectionByStudent.get(student.id) ?? null,
    })),
    excludedCount: students.filter((student) => !student.isActive || !student.leagueEligible).length,
  };
}

export async function setStudentLeagueEligibility(studentId: string, eligible: boolean) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, deletedAt: null },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Student");
  return prisma.user.update({
    where: { id: studentId },
    data: { leagueEligible: eligible },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      leagueEligible: true,
    },
  });
}

const CURATOR_STREAK_CATEGORIES = new Set(["illness", "family", "other"]);
const CRM_STREAK_CATEGORIES = new Set([
  "school_holiday",
  "subscription_pause",
  "all_lessons_cancelled",
]);

export async function createWeeklyStreakProtection(params: {
  studentId: string;
  weekDate: Date;
  source: "crm" | "curator";
  category:
    | "school_holiday"
    | "subscription_pause"
    | "all_lessons_cancelled"
    | "illness"
    | "family"
    | "other";
  comment: string;
  sourceKey: string;
  createdById?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const week = getAqtobeWeekRange(params.weekDate);
  const comment = params.comment.trim();
  if (comment.length < 3) throw new BadRequestError("Укажите причину защиты серии");
  if (week.start > now) throw new BadRequestError("Нельзя защитить будущую неделю");
  const deadline = new Date(week.end.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (now > deadline) {
    throw new BadRequestError("Срок защиты серии истёк: доступно не более семи дней после недели");
  }
  if (params.source === "curator" && !CURATOR_STREAK_CATEGORIES.has(params.category)) {
    throw new BadRequestError("Куратор может выбрать болезнь, семейные обстоятельства или другую причину");
  }
  if (params.source === "crm" && !CRM_STREAK_CATEGORIES.has(params.category)) {
    throw new BadRequestError("CRM может передать каникулы, паузу абонемента или отмену всех занятий");
  }

  const economicEpoch = await requireActiveEconomicEpochForEvent(now);
  if (week.end <= economicEpoch.startsAt) {
    throw new BadRequestError("Неделя находится до начала новой экономической эпохи");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(economicEpoch.id, week.key)}))`;
    const existingBySource = await tx.weeklyStreakProtection.findUnique({
      where: { sourceKey: params.sourceKey },
    });
    if (existingBySource) {
      return { protection: existingBySource, idempotent: true, corrected: false };
    }
    const participant = await tx.economicEpochParticipant.findFirst({
      where: {
        epochId: economicEpoch.id,
        studentId: params.studentId,
        student: { isActive: true, deletedAt: null, role: { slug: "student" } },
      },
      select: { id: true },
    });
    if (!participant) throw new NotFoundError("Economic epoch participant");
    const activeProtection = await tx.weeklyStreakProtection.findFirst({
      where: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        weekStart: week.start,
        revokedAt: null,
      },
    });
    if (activeProtection) {
      throw new ConflictError(
        "Эта неделя уже защищена",
        "WEEKLY_STREAK_PROTECTION_EXISTS",
      );
    }
    const activityExists = await tx.weeklyLeagueActivityEvent.findFirst({
      where: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        occurredAt: { gte: week.start, lt: week.end },
      },
      select: { id: true },
    });
    if (activityExists) {
      throw new ConflictError(
        "Неделя уже содержит подтверждённую активность и не требует защиты серии",
        "WEEKLY_STREAK_ACTIVITY_EXISTS",
      );
    }

    const protection = await tx.weeklyStreakProtection.create({
      data: {
        economicEpochId: economicEpoch.id,
        studentId: params.studentId,
        weekStart: week.start,
        source: params.source,
        category: params.category,
        comment: comment.slice(0, 512),
        sourceKey: params.sourceKey,
        createdById: params.createdById ?? null,
        createdAt: now,
      },
    });

    const snapshot = await tx.weeklyLeagueSnapshot.findUnique({
      where: {
        economicEpochId_weekStart: {
          economicEpochId: economicEpoch.id,
          weekStart: week.start,
        },
      },
      select: { id: true },
    });
    let corrected = false;
    if (snapshot) {
      const [baseEvent, state] = await Promise.all([
        tx.weeklyStreakEvent.findUnique({
          where: {
            sourceKey: `weekly-streak:${economicEpoch.id}:${week.key}:${params.studentId}`,
          },
        }),
        tx.weeklyStreakState.findUnique({
          where: {
            economicEpochId_studentId: {
              economicEpochId: economicEpoch.id,
              studentId: params.studentId,
            },
          },
        }),
      ]);
      if (
        baseEvent?.eventType === "broken"
        && state?.lastProcessedWeekStart?.getTime() === week.start.getTime()
      ) {
        await tx.weeklyStreakEvent.create({
          data: {
            economicEpochId: economicEpoch.id,
            studentId: params.studentId,
            weekStart: week.start,
            eventType: "corrected",
            streakBefore: state.currentWeeks,
            streakAfter: baseEvent.streakBefore,
            sourceKey: `weekly-streak-correction:${protection.id}`,
            protectionId: protection.id,
            reason: `Поздняя защита серии: ${comment}`.slice(0, 512),
            createdAt: now,
          },
        });
        await tx.weeklyStreakState.update({
          where: { id: state.id },
          data: {
            currentWeeks: baseEvent.streakBefore,
            bestWeeks: Math.max(state.bestWeeks, baseEvent.streakBefore),
          },
        });
        corrected = true;
      }
    }
    return { protection, idempotent: false, corrected };
  });
}

async function persistLeagueAward(params: {
  studentId: string;
  week: AqtobeWeekRange;
  awardType: WeeklyLeagueAwardType;
  position: number | null;
  xp: number;
  coins: number;
  reason: string;
}) {
  const sourceKey = `weekly-league:${params.week.key}:${params.awardType}:${params.studentId}`;
  await addMaestroCoins({
    studentId: params.studentId,
    amount: params.coins,
    reason: params.reason,
    sourceType: "weekly_league",
    sourceKey,
    createdBy: params.studentId,
  });
  await prisma.weeklyLeagueAward.upsert({
    where: { sourceKey },
    create: {
      studentId: params.studentId,
      weekStart: params.week.start,
      awardType: params.awardType,
      position: params.position,
      xp: params.xp,
      coins: params.coins,
      sourceKey,
    },
    update: {},
  });
}

export async function finalizeWeeklyLeagueSnapshot(params: {
  week: AqtobeWeekRange;
  economicEpochId: string;
  finalizedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${weeklyFinalizationLockKey(params.economicEpochId, params.week.key)}))`;
    const existing = await tx.weeklyLeagueSnapshot.findUnique({
      where: {
        economicEpochId_weekStart: {
          economicEpochId: params.economicEpochId,
          weekStart: params.week.start,
        },
      },
      include: { entries: true },
    });
    if (existing) {
      return {
        snapshotId: existing.id,
        week: params.week.key,
        participants: existing.participantCount,
        idempotent: true,
      };
    }

    const [events, participants, activities, protections, streakStates, attendanceCoinRows] = await Promise.all([
      tx.leagueXpEvent.findMany({
        where: {
          economicEpochId: params.economicEpochId,
          createdAt: { gte: params.week.start, lt: params.week.end },
          recordedAt: { lte: params.finalizedAt },
          student: {
            leagueEligible: true,
            isActive: true,
            deletedAt: null,
            role: { slug: "student" },
          },
        },
        select: {
          studentId: true,
          amount: true,
          sourceType: true,
          createdAt: true,
          description: true,
          student: { select: { firstName: true, lastName: true } },
        },
      }),
      tx.economicEpochParticipant.findMany({
        where: {
          epochId: params.economicEpochId,
          activatedAt: { lt: params.week.end },
          student: {
            leagueEligible: true,
            isActive: true,
            deletedAt: null,
            role: { slug: "student" },
          },
        },
        select: {
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
        },
      }),
      tx.weeklyLeagueActivityEvent.findMany({
        where: {
          economicEpochId: params.economicEpochId,
          occurredAt: { gte: params.week.start, lt: params.week.end },
          recordedAt: { lte: params.finalizedAt },
        },
        select: { studentId: true },
      }),
      tx.weeklyStreakProtection.findMany({
        where: {
          economicEpochId: params.economicEpochId,
          weekStart: params.week.start,
          createdAt: { lte: params.finalizedAt },
          revokedAt: null,
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.weeklyStreakState.findMany({
        where: { economicEpochId: params.economicEpochId },
      }),
      tx.maestroCoinTransaction.findMany({
        where: {
          economicEpochId: params.economicEpochId,
          sourceType: { in: ["offline_lesson", "online_lesson"] },
          amount: { gt: 0 },
          createdAt: { gte: params.week.start, lt: params.week.end },
        },
        select: { studentId: true, amount: true },
      }),
    ]);
    const ranking = rankLeagueEvents(events);
    const rankingByStudent = new Map(ranking.map((entry) => [entry.studentId, entry]));
    const participantsByStudent = new Map(participants.map((entry) => [entry.studentId, entry.student]));
    for (const entry of ranking) {
      if (!participantsByStudent.has(entry.studentId)) {
        const event = events.find((item) => item.studentId === entry.studentId);
        if (event) participantsByStudent.set(entry.studentId, event.student);
      }
    }
    const unrankedStudentIds = [...participantsByStudent.keys()]
      .filter((studentId) => !rankingByStudent.has(studentId))
      .sort((left, right) => {
        const leftStudent = participantsByStudent.get(left)!;
        const rightStudent = participantsByStudent.get(right)!;
        return `${leftStudent.firstName} ${leftStudent.lastName}`.localeCompare(
          `${rightStudent.firstName} ${rightStudent.lastName}`,
          "ru",
        );
      });
    const finalRanking = [
      ...ranking,
      ...unrankedStudentIds.map((studentId, index) => {
        const student = participantsByStudent.get(studentId)!;
        return {
          position: ranking.length + index + 1,
          studentId,
          displayName: `${student.firstName} ${student.lastName}`.trim(),
          xp: 0,
          eventCount: 0,
          lastEventAt: params.week.start,
        };
      }),
    ];
    const eventsByStudent = new Map<string, typeof events>();
    for (const event of events) {
      const studentEvents = eventsByStudent.get(event.studentId) ?? [];
      studentEvents.push(event);
      eventsByStudent.set(event.studentId, studentEvents);
    }
    const activeStudentIds = new Set(activities.map((activity) => activity.studentId));
    const protectionByStudent = new Map(protections.map((protection) => [protection.studentId, protection]));
    const stateByStudent = new Map(streakStates.map((state) => [state.studentId, state]));
    const attendanceCoinsByStudent = new Map<string, number>();
    for (const row of attendanceCoinRows) {
      attendanceCoinsByStudent.set(
        row.studentId,
        (attendanceCoinsByStudent.get(row.studentId) ?? 0) + row.amount,
      );
    }

    const snapshotEntries: Array<{
      studentId: string;
      displayName: string;
      position: number;
      xp: number;
      eventCount: number;
      goalXp: number;
      goalMet: boolean;
      coinsAwarded: number;
      streakWeeks: number;
      streakOutcome: "extended" | "frozen" | "broken";
      coinBreakdown: Prisma.InputJsonValue;
      milestonesEarned: Prisma.InputJsonValue;
      breakdown: Prisma.InputJsonValue;
    }> = [];

    for (const entry of finalRanking) {
      const currentState = stateByStudent.get(entry.studentId);
      if (
        currentState?.lastProcessedWeekStart
        && currentState.lastProcessedWeekStart >= params.week.start
      ) {
        throw new ConflictError(
          "Серия этой или более поздней недели уже обработана",
          "WEEKLY_STREAK_ALREADY_PROCESSED",
        );
      }
      const protection = protectionByStudent.get(entry.studentId);
      const streak = nextWeeklyStreak({
        currentWeeks: currentState?.currentWeeks ?? 0,
        bestWeeks: currentState?.bestWeeks ?? 0,
        hasActivity: activeStudentIds.has(entry.studentId),
        frozen: Boolean(protection),
      });
      await tx.weeklyStreakEvent.create({
        data: {
          economicEpochId: params.economicEpochId,
          studentId: entry.studentId,
          weekStart: params.week.start,
          eventType: streak.eventType,
          streakBefore: currentState?.currentWeeks ?? 0,
          streakAfter: streak.currentWeeks,
          sourceKey: `weekly-streak:${params.economicEpochId}:${params.week.key}:${entry.studentId}`,
          protectionId: streak.eventType === "frozen" ? protection?.id ?? null : null,
          reason: streak.eventType === "extended"
            ? "Неделя содержит подтверждённое занятие или принятое ДЗ"
            : streak.eventType === "frozen"
              ? protection?.comment ?? "Серия защищена"
              : "Неделя завершилась без подтверждённой активности",
        },
      });
      await tx.weeklyStreakState.upsert({
        where: {
          economicEpochId_studentId: {
            economicEpochId: params.economicEpochId,
            studentId: entry.studentId,
          },
        },
        create: {
          economicEpochId: params.economicEpochId,
          studentId: entry.studentId,
          currentWeeks: streak.currentWeeks,
          bestWeeks: streak.bestWeeks,
          lastProcessedWeekStart: params.week.start,
        },
        update: {
          currentWeeks: streak.currentWeeks,
          bestWeeks: streak.bestWeeks,
          lastProcessedWeekStart: params.week.start,
        },
      });

      let placementCoins = 0;
      const placement = entry.xp > 0
        ? WEEKLY_LEAGUE_PRIZES.find((prize) => prize.position === entry.position)
        : null;
      if (placement) {
        placementCoins = placement.coins;
        const sourceKey = `weekly-league:${params.economicEpochId}:${params.week.key}:${placement.awardType}:${entry.studentId}`;
        await creditMaestroCoinsInTransaction(tx, {
          economicEpochId: params.economicEpochId,
          studentId: entry.studentId,
          amount: placement.coins,
          reason: `${placement.label} в Недельной лиге Maestro (${weeklyLeagueWeekLabel(params.week)})`,
          sourceType: "weekly_league",
          sourceKey,
          eventAt: params.finalizedAt,
        });
        await tx.weeklyLeagueAward.create({
          data: {
            economicEpochId: params.economicEpochId,
            studentId: entry.studentId,
            weekStart: params.week.start,
            awardType: placement.awardType,
            position: entry.position,
            xp: entry.xp,
            coins: placement.coins,
            sourceKey,
          },
        });
      }

      const goalCoins = entry.xp >= WEEKLY_LEAGUE_GOAL_XP ? WEEKLY_LEAGUE_GOAL_COINS : 0;
      if (goalCoins > 0) {
        const sourceKey = `weekly-league:${params.economicEpochId}:${params.week.key}:personal_goal:${entry.studentId}`;
        await creditMaestroCoinsInTransaction(tx, {
          economicEpochId: params.economicEpochId,
          studentId: entry.studentId,
          amount: goalCoins,
          reason: `Личная цель Недельной лиги выполнена (${weeklyLeagueWeekLabel(params.week)})`,
          sourceType: "weekly_league",
          sourceKey,
          eventAt: params.finalizedAt,
        });
        await tx.weeklyLeagueAward.create({
          data: {
            economicEpochId: params.economicEpochId,
            studentId: entry.studentId,
            weekStart: params.week.start,
            awardType: "personal_goal",
            position: entry.position,
            xp: entry.xp,
            coins: goalCoins,
            sourceKey,
          },
        });
      }

      let milestoneCoins = 0;
      const earnedMilestones: number[] = [];
      const milestone = streak.eventType === "extended"
        ? weeklyStreakMilestone(streak.currentWeeks)
        : null;
      if (milestone) {
        const existingMilestone = await tx.weeklyStreakMilestone.findUnique({
          where: {
            economicEpochId_studentId_milestoneWeeks: {
              economicEpochId: params.economicEpochId,
              studentId: entry.studentId,
              milestoneWeeks: milestone.weeks,
            },
          },
          select: { id: true },
        });
        if (!existingMilestone) {
          const sourceKey = `weekly-streak-milestone:${params.economicEpochId}:${entry.studentId}:${milestone.weeks}`;
          const milestoneRow = await tx.weeklyStreakMilestone.create({
            data: {
              economicEpochId: params.economicEpochId,
              studentId: entry.studentId,
              milestoneWeeks: milestone.weeks,
              coinsAwarded: milestone.coins,
              sourceKey,
              earnedAt: params.finalizedAt,
            },
            select: { id: true },
          });
          await creditMaestroCoinsInTransaction(tx, {
            economicEpochId: params.economicEpochId,
            studentId: entry.studentId,
            amount: milestone.coins,
            reason: milestone.title,
            sourceType: "streak_milestone",
            sourceId: milestoneRow.id,
            sourceKey,
            eventAt: params.finalizedAt,
          });
          milestoneCoins = milestone.coins;
          earnedMilestones.push(milestone.weeks);
        }
      }

      const attendanceCoins = attendanceCoinsByStudent.get(entry.studentId) ?? 0;
      snapshotEntries.push({
        studentId: entry.studentId,
        displayName: entry.displayName,
        position: entry.position,
        xp: entry.xp,
        eventCount: entry.eventCount,
        goalXp: WEEKLY_LEAGUE_GOAL_XP,
        goalMet: entry.xp >= WEEKLY_LEAGUE_GOAL_XP,
        coinsAwarded: attendanceCoins + placementCoins + goalCoins + milestoneCoins,
        streakWeeks: streak.currentWeeks,
        streakOutcome: streak.eventType,
        coinBreakdown: {
          attendance: attendanceCoins,
          placement: placementCoins,
          personalGoal: goalCoins,
          milestone: milestoneCoins,
        } as Prisma.InputJsonValue,
        milestonesEarned: earnedMilestones as Prisma.InputJsonValue,
        breakdown: breakdownFromEvents(eventsByStudent.get(entry.studentId) ?? [])
          .map(({ sourceType, xp }) => ({ sourceType, xp })) as Prisma.InputJsonValue,
      });
    }

    const snapshot = await tx.weeklyLeagueSnapshot.create({
      data: {
        economicEpochId: params.economicEpochId,
        weekStart: params.week.start,
        weekEnd: params.week.end,
        rulesVersion: WEEKLY_LEAGUE_RULES_VERSION,
        participantCount: finalRanking.length,
        sourceKey: `weekly-league-snapshot:${params.economicEpochId}:${params.week.key}`,
        finalizedAt: params.finalizedAt,
        entries: snapshotEntries.length ? {
          create: snapshotEntries,
        } : undefined,
      },
      select: { id: true, participantCount: true },
    });
    return {
      snapshotId: snapshot.id,
      week: params.week.key,
      participants: snapshot.participantCount,
      idempotent: false,
    };
  }, { timeout: 30_000 });
}

export async function finalizePreviousWeeklyLeague(now = new Date()) {
  const week = getAqtobeWeekRange(now, 1);
  const finalizesAt = weeklyLeagueFinalizesAt(week);
  if (now < finalizesAt) {
    return {
      week: week.key,
      participants: 0,
      status: "finalizing" as const,
      finalizesAt,
    };
  }

  if (rewardEconomyV2AppliesToEvent(now)) {
    const economicEpoch = await requireActiveEconomicEpochForEvent(now);
    if (week.end <= economicEpoch.startsAt) {
      return {
        week: week.key,
        participants: 0,
        status: "before_epoch" as const,
        finalizesAt,
      };
    }
    const result = await finalizeWeeklyLeagueSnapshot({
      week,
      economicEpochId: economicEpoch.id,
      finalizedAt: now,
    });
    return { ...result, status: "finalized" as const, finalizesAt };
  }

  const { ranking } = await listRankedWeek(week);
  for (const entry of ranking) {
    const placement = LEGACY_WEEKLY_LEAGUE_PRIZES.find((prize) => prize.position === entry.position);
    if (placement) {
      await persistLeagueAward({
        studentId: entry.studentId,
        week,
        awardType: placement.awardType,
        position: entry.position,
        xp: entry.xp,
        coins: placement.coins,
        reason: `${placement.label} в Недельной лиге Maestro (${weeklyLeagueWeekLabel(week)})`,
      });
    }
    if (entry.xp >= WEEKLY_LEAGUE_GOAL_XP) {
      await persistLeagueAward({
        studentId: entry.studentId,
        week,
        awardType: "personal_goal",
        position: entry.position,
        xp: entry.xp,
        coins: 3,
        reason: `Личная цель Недельной лиги выполнена (${weeklyLeagueWeekLabel(week)})`,
      });
    }
  }
  return { week: week.key, participants: ranking.length, status: "finalized" as const, finalizesAt };
}

export function startWeeklyLeagueFinalizerJob() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await finalizePreviousWeeklyLeague();
    } catch (error) {
      console.error("[weekly-league-finalizer]", error);
    } finally {
      running = false;
    }
  };
  const initialTimer = setTimeout(() => void run(), 25_000);
  initialTimer.unref();
  const interval = setInterval(() => void run(), 60 * 60 * 1000);
  interval.unref();
}
