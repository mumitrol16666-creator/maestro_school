import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listPreparedTestTemplates } from "../../domain/prepared-tests.js";
import {
  authenticate,
  requireContentAdmin,
  requireStudent,
  requireTeacher,
} from "../guards/auth.guards.js";
import {
  createStudentSectorProposal,
  decideSectorProposal,
  listStudentSectorProposals,
  listTeacherSectorProposals,
} from "../../application/services/sector-proposal.service.js";
import {
  createSectorTemplate,
  getSectorTemplate,
  listSectorTemplates,
  setSectorTemplatePublished,
  updateSectorTemplate,
} from "../../application/services/sector-template.service.js";

const proposalKind = z.enum(["topic", "song", "goal"]);
const proposalStatus = z.enum(["new", "accepted", "declined"]);

const templateInputSchema = z.object({
  crmDirectionId: z.string().trim().min(1).max(64).nullable().optional(),
  number: z.coerce.number().int().min(1).max(999),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().max(5000).optional(),
  preparedTestId: z.string().trim().max(64).nullable().optional(),
  topics: z.array(z.object({
    line: z.enum(["melody", "chords", "theory", "song", "other"]),
    title: z.string().trim().min(1).max(1000),
    masteryCriteria: z.string().trim().max(5000).optional(),
    materials: z.array(z.object({
      title: z.string().trim().max(255),
      url: z.string().trim().max(1024),
      note: z.string().trim().max(1000).optional(),
    })).max(20).optional(),
  })).max(60),
});

export async function sectorRoutes(app: FastifyInstance) {
  // Ученик: предложения в сектор.
  app.get("/students/me/sector-proposals", { preHandler: [authenticate, requireStudent] }, async (request) => ({
    data: await listStudentSectorProposals(request.user!.id),
  }));
  app.post("/students/me/sector-proposals", { preHandler: [authenticate, requireStudent] }, async (request, reply) => {
    const body = z.object({
      crmDirectionId: z.string().trim().min(1).max(64),
      kind: proposalKind.default("topic"),
      text: z.string().trim().min(1).max(2000),
      link: z.string().trim().url().max(1024).nullable().optional(),
    }).parse(request.body);
    const created = await createStudentSectorProposal(request.user!.id, body);
    return reply.status(201).send({ data: created });
  });

  // Преподаватель: очередь предложений и решение.
  app.get("/teachers/me/sector-proposals", { preHandler: [authenticate, requireTeacher] }, async (request) => {
    const query = z.object({
      status: proposalStatus.optional(),
      crmStudentId: z.string().trim().min(1).max(128).optional(),
    }).parse(request.query ?? {});
    return { data: await listTeacherSectorProposals(request.user!.id, query) };
  });
  app.post("/teachers/me/sector-proposals/:id/decision", { preHandler: [authenticate, requireTeacher] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      decision: z.enum(["accepted", "declined"]),
      reply: z.string().trim().max(2000).nullable().optional(),
      acceptedTopicId: z.string().uuid().nullable().optional(),
    }).parse(request.body);
    return { data: await decideSectorProposal(request.user!.id, id, body) };
  });

  // Готовые тесты для выбора теста сектора.
  app.get("/teachers/me/prepared-tests", { preHandler: [authenticate, requireTeacher] }, async () => ({
    data: listPreparedTestTemplates().map((item) => ({ id: item.id, title: item.title, description: item.description })),
  }));

  // Шаблоны ступеней: преподаватель читает опубликованные, администратор ведёт.
  app.get("/teachers/me/sector-templates", { preHandler: [authenticate, requireTeacher] }, async (request) => {
    const query = z.object({ crmDirectionId: z.string().trim().min(1).max(64).optional() }).parse(request.query ?? {});
    return { data: await listSectorTemplates({ crmDirectionId: query.crmDirectionId, publishedOnly: true }) };
  });
  app.get("/admin/sector-templates", { preHandler: [authenticate, requireContentAdmin] }, async (request) => {
    const query = z.object({ crmDirectionId: z.string().trim().min(1).max(64).optional() }).parse(request.query ?? {});
    return { data: await listSectorTemplates({ crmDirectionId: query.crmDirectionId }) };
  });
  app.get("/admin/sector-templates/:id", { preHandler: [authenticate, requireContentAdmin] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getSectorTemplate(id) };
  });
  app.post("/admin/sector-templates", { preHandler: [authenticate, requireContentAdmin] }, async (request, reply) => {
    const body = templateInputSchema.parse(request.body);
    return reply.status(201).send({ data: await createSectorTemplate(request.user!.id, body) });
  });
  app.put("/admin/sector-templates/:id", { preHandler: [authenticate, requireContentAdmin] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = templateInputSchema.parse(request.body);
    return { data: await updateSectorTemplate(id, body) };
  });
  app.post("/admin/sector-templates/:id/publish", { preHandler: [authenticate, requireContentAdmin] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ isPublished: z.boolean() }).parse(request.body);
    return { data: await setSectorTemplatePublished(id, body.isPublished) };
  });
}
