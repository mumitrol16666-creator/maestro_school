import {
  Prisma,
  type LeagueXpSourceType,
  type WeeklyLeagueAwardType,
} from "@prisma/client";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { addMaestroCoins } from "./coins.service.js";
import {
  calculateLeagueRankDelta,
  getAqtobeWeekRange,
  rankLeagueEvents,
  WEEKLY_LEAGUE_GOAL_XP,
  WEEKLY_LEAGUE_PRIZES,
  WEEKLY_LEAGUE_RULES,
  weeklyLeagueSourceLabels,
  weeklyLeagueWeekLabel,
  type AqtobeWeekRange,
} from "./weekly-league-policy.js";

async function listRankedWeek(range: AqtobeWeekRange) {
  const events = await prisma.leagueXpEvent.findMany({
    where: {
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
      description: true,
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
}) {
  if (params.amount <= 0) return { awarded: false as const };
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
  if (!student) return { awarded: false as const };

  const existing = await prisma.leagueXpEvent.findUnique({
    where: { sourceKey: params.sourceKey },
    select: { id: true },
  });
  if (existing) return { awarded: false as const };

  try {
    const event = await prisma.leagueXpEvent.create({
      data: {
        studentId: params.studentId,
        amount: params.amount,
        sourceType: params.sourceType,
        sourceKey: params.sourceKey,
        description: params.description.trim().slice(0, 512),
        awardedById: params.awardedById ?? null,
      },
    });
    return { awarded: true as const, eventId: event.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { awarded: false as const };
    }
    throw error;
  }
}

export async function awardTeacherLeagueBonus(params: {
  teacherId: string;
  studentId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  if (params.amount < 1 || params.amount > 10) {
    throw new BadRequestError("За один бонус можно начислить от 1 до 10 XP");
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
  const sourceKey = `teacher-bonus:${params.teacherId}:${params.idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
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
        studentId: params.studentId,
        awardedById: params.teacherId,
        sourceType: "teacher_bonus",
        createdAt: { gte: range.start, lt: range.end },
      },
      _sum: { amount: true },
    });
    const remainder = 10 - (alreadyAwarded._sum.amount ?? 0);
    if (params.amount > remainder) {
      throw new BadRequestError(
        remainder > 0
          ? `На этой неделе этому ученику можно добавить ещё ${remainder} XP`
          : "Лимит бонусов этому ученику на неделю уже использован",
      );
    }

    const event = await tx.leagueXpEvent.create({
      data: {
        studentId: params.studentId,
        amount: params.amount,
        sourceType: "teacher_bonus",
        sourceKey,
        description: reason,
        awardedById: params.teacherId,
      },
      select: { id: true },
    });
    return { awarded: true as const, eventId: event.id };
  });
}

async function calculateStreak(studentId: string, selectedOffset: number, now: Date) {
  const oldest = getAqtobeWeekRange(now, selectedOffset + 7);
  const newest = getAqtobeWeekRange(now, selectedOffset);
  const events = await prisma.leagueXpEvent.findMany({
    where: {
      studentId,
      createdAt: { gte: oldest.start, lt: newest.end },
    },
    select: { createdAt: true },
  });
  const activeWeeks = new Set(events.map((event) => getAqtobeWeekRange(event.createdAt).key));
  let streak = 0;
  for (let offset = selectedOffset; offset < selectedOffset + 8; offset += 1) {
    if (!activeWeeks.has(getAqtobeWeekRange(now, offset).key)) break;
    streak += 1;
  }
  return streak;
}

export async function getWeeklyLeagueOverview(
  viewerStudentId: string | undefined,
  weekOffset = 0,
  now = new Date(),
) {
  const normalizedOffset = Math.min(12, Math.max(0, Math.trunc(weekOffset)));
  const range = getAqtobeWeekRange(now, normalizedOffset);
  const previousRange = getAqtobeWeekRange(now, normalizedOffset + 1);
  const [{ events, ranking }, { ranking: previousRanking }, awards] = await Promise.all([
    listRankedWeek(range),
    listRankedWeek(previousRange),
    prisma.weeklyLeagueAward.findMany({
      where: { weekStart: range.start },
      select: { studentId: true, coins: true, awardType: true },
    }),
  ]);

  const previousPositions = new Map(previousRanking.map((entry) => [entry.studentId, entry.position]));
  const awardCoins = new Map<string, number>();
  for (const award of awards) {
    awardCoins.set(award.studentId, (awardCoins.get(award.studentId) ?? 0) + award.coins);
  }

  const standings = ranking.map((entry) => ({
    position: entry.position,
    studentId: entry.studentId,
    displayName: entry.displayName,
    xp: entry.xp,
    eventCount: entry.eventCount,
    rankDelta: calculateLeagueRankDelta(entry.position, previousPositions.get(entry.studentId)),
    isCurrentStudent: entry.studentId === viewerStudentId,
    awardedCoins: awardCoins.get(entry.studentId) ?? 0,
  }));

  const viewer = viewerStudentId
    ? await prisma.user.findFirst({
        where: { id: viewerStudentId, role: { slug: "student" }, deletedAt: null },
        select: { id: true, leagueEligible: true, isActive: true },
      })
    : null;
  const currentEntry = viewerStudentId
    ? standings.find((entry) => entry.studentId === viewerStudentId)
    : undefined;
  const viewerEvents = viewerStudentId
    ? events.filter((event) => event.studentId === viewerStudentId)
    : [];
  const breakdown = [...new Set(viewerEvents.map((event) => event.sourceType))]
    .map((sourceType) => ({
      sourceType,
      label: weeklyLeagueSourceLabels[sourceType],
      xp: viewerEvents
        .filter((event) => event.sourceType === sourceType)
        .reduce((total, event) => total + event.amount, 0),
    }))
    .sort((left, right) => right.xp - left.xp);
  const currentXp = currentEntry?.xp ?? 0;
  const prize = currentEntry
    ? WEEKLY_LEAGUE_PRIZES.find((item) => item.position === currentEntry.position)
    : null;
  const projectedRewardCoins = normalizedOffset === 0
    ? (prize?.coins ?? 0) + (currentXp >= WEEKLY_LEAGUE_GOAL_XP ? 3 : 0)
    : awardCoins.get(viewerStudentId ?? "") ?? 0;

  const previousXp = new Map(previousRanking.map((entry) => [entry.studentId, entry.xp]));
  const breakthrough = standings
    .map((entry) => ({
      ...entry,
      gain: previousXp.has(entry.studentId) ? entry.xp - (previousXp.get(entry.studentId) ?? 0) : 0,
    }))
    .filter((entry) => entry.gain > 0)
    .sort((left, right) => right.gain - left.gain || left.position - right.position)[0] ?? null;

  return {
    week: {
      startAt: range.start,
      endAt: range.end,
      key: range.key,
      label: weeklyLeagueWeekLabel(range),
      isCurrent: normalizedOffset === 0,
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
      rankDelta: currentEntry?.rankDelta ?? null,
      goalXp: WEEKLY_LEAGUE_GOAL_XP,
      goalProgress: Math.min(100, Math.round(currentXp / WEEKLY_LEAGUE_GOAL_XP * 100)),
      streakWeeks: viewer ? await calculateStreak(viewerStudentId, normalizedOffset, now) : 0,
      projectedRewardCoins,
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
      placements: WEEKLY_LEAGUE_PRIZES,
      personalGoal: { xp: WEEKLY_LEAGUE_GOAL_XP, coins: 3, label: "Личная цель" },
    },
  };
}

export async function getAdminWeeklyLeagueOverview(weekOffset = 0, now = new Date()) {
  const normalizedOffset = Math.min(12, Math.max(0, Math.trunc(weekOffset)));
  const [overview, students, fullWeek] = await Promise.all([
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
    listRankedWeek(getAqtobeWeekRange(now, normalizedOffset)),
  ]);
  const standings = new Map(fullWeek.ranking.map((entry) => [entry.studentId, entry]));
  return {
    ...overview,
    students: students.map((student) => ({
      ...student,
      fullName: `${student.firstName} ${student.lastName}`.trim(),
      effectiveEligible: student.isActive && student.leagueEligible,
      xp: standings.get(student.id)?.xp ?? 0,
      position: standings.get(student.id)?.position ?? null,
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

async function persistLeagueAward(params: {
  studentId: string;
  week: AqtobeWeekRange;
  awardType: WeeklyLeagueAwardType;
  position: number | null;
  xp: number;
  coins: number;
  reason: string;
}) {
  await addMaestroCoins({
    studentId: params.studentId,
    amount: params.coins,
    reason: params.reason,
    sourceType: "weekly_league",
    sourceKey: `weekly-league:${params.week.key}:${params.awardType}:${params.studentId}`,
    createdBy: params.studentId,
  });
  await prisma.weeklyLeagueAward.upsert({
    where: {
      weekStart_studentId_awardType: {
        weekStart: params.week.start,
        studentId: params.studentId,
        awardType: params.awardType,
      },
    },
    create: {
      studentId: params.studentId,
      weekStart: params.week.start,
      awardType: params.awardType,
      position: params.position,
      xp: params.xp,
      coins: params.coins,
    },
    update: {},
  });
}

export async function finalizePreviousWeeklyLeague(now = new Date()) {
  const week = getAqtobeWeekRange(now, 1);
  const { ranking } = await listRankedWeek(week);
  for (const entry of ranking) {
    const placement = WEEKLY_LEAGUE_PRIZES.find((prize) => prize.position === entry.position);
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
  return { week: week.key, participants: ranking.length };
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
