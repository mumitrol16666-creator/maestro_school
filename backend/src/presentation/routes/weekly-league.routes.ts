import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  awardTeacherLeagueBonus,
  createWeeklyStreakProtection,
  getAdminWeeklyLeagueOverview,
  getWeeklyLeagueHistory,
  getWeeklyLeagueOverview,
  setStudentLeagueEligibility,
} from "../../application/services/weekly-league.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { getProductPointsLeaderboard } from "../../application/services/points.service.js";
import {
  authenticate,
  requireContentAdmin,
  requireStudent,
  requireTeacher,
} from "../guards/auth.guards.js";

const weekQuery = z.object({
  weekOffset: z.coerce.number().int().min(0).max(12).default(0),
});

export async function weeklyLeagueRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/points-leaderboard",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const overview = await getProductPointsLeaderboard(request.user!.id);
      const publicStanding = <T extends { studentId: string }>(entry: T) => {
        const { studentId: _studentId, ...publicEntry } = entry;
        return publicEntry;
      };
      return {
        data: {
          ...overview,
          standings: overview.standings.map(publicStanding),
          currentStudent: overview.currentStudent
            ? publicStanding(overview.currentStudent)
            : null,
        },
      };
    },
  );

  app.get(
    "/students/me/weekly-league",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const { weekOffset } = weekQuery.parse(request.query);
      const overview = await getWeeklyLeagueOverview(request.user!.id, weekOffset);
      const publicStanding = <T extends { studentId: string }>(entry: T) => {
        const { studentId: _studentId, ...publicEntry } = entry;
        return publicEntry;
      };
      return {
        data: {
          ...overview,
          standings: overview.standings.map(publicStanding),
          highlights: {
            leader: overview.highlights.leader
              ? publicStanding(overview.highlights.leader)
              : null,
            breakthrough: overview.highlights.breakthrough
              ? publicStanding(overview.highlights.breakthrough)
              : null,
          },
        },
      };
    },
  );

  app.get(
    "/students/me/weekly-league/history",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const query = z.object({
        cursor: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(20).default(8),
      }).parse(request.query);
      return {
        data: await getWeeklyLeagueHistory(request.user!.id, query),
      };
    },
  );

  app.get(
    "/admin/weekly-league",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const { weekOffset } = weekQuery.parse(request.query);
      return { data: await getAdminWeeklyLeagueOverview(weekOffset) };
    },
  );

  app.patch(
    "/admin/weekly-league/students/:id",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { eligible } = z.object({ eligible: z.boolean() }).parse(request.body);
      const student = await setStudentLeagueEligibility(id, eligible);
      await writeAuditLog({
        entityType: "weekly_league_student",
        entityId: id,
        action: "update",
        actorId: request.user!.id,
        payload: { eligible },
      });
      return { data: student };
    },
  );

  app.post(
    "/admin/weekly-league/streak-protections",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request, reply) => {
      const body = z.object({
        studentId: z.string().uuid(),
        weekDate: z.coerce.date(),
        category: z.enum(["illness", "family", "other"]),
        comment: z.string().trim().min(3).max(512),
        idempotencyKey: z.string().uuid(),
      }).parse(request.body);
      const result = await createWeeklyStreakProtection({
        ...body,
        source: "curator",
        sourceKey: `curator-streak-protection:${body.idempotencyKey}`,
        createdById: request.user!.id,
      });
      if (!result.idempotent) {
        await writeAuditLog({
          entityType: "weekly_streak_protection",
          entityId: result.protection.id,
          action: "create",
          actorId: request.user!.id,
          payload: {
            studentId: body.studentId,
            weekDate: body.weekDate,
            category: body.category,
            corrected: result.corrected,
          },
        });
      }
      return reply.status(result.idempotent ? 200 : 201).send({ data: result });
    },
  );

  app.post(
    "/teacher/weekly-league/bonus",
    { preHandler: [authenticate, requireTeacher] },
    async (request, reply) => {
      const body = z.object({
        studentId: z.string().uuid(),
        amount: z.number().int().min(1).max(10),
        reason: z.string().trim().min(3).max(160),
        idempotencyKey: z.string().uuid(),
      }).parse(request.body);
      const result = await awardTeacherLeagueBonus({
        teacherId: request.user!.id,
        ...body,
      });
      return reply.status(result.awarded ? 201 : 200).send({ data: result });
    },
  );
}
