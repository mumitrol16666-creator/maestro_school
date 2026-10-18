import type { SectorTemplateLine } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { listPreparedTestTemplates } from "../../domain/prepared-tests.js";

/**
 * Ступени программы. Шаблон хранит темы по линиям (мелодия / аккорды / теория /
 * песня) и необязательный тест ступени; преподаватель открывает из него сектор
 * ученику и правит под него. Темы создаются как обычные LearningTopic.
 */

export type SectorTemplateTopicInput = {
  line: SectorTemplateLine;
  title: string;
  masteryCriteria?: string;
  materials?: Array<{ title: string; url: string; note?: string }>;
};

export type SectorTemplateInput = {
  crmDirectionId?: string | null;
  number: number;
  title: string;
  summary?: string;
  preparedTestId?: string | null;
  topics: SectorTemplateTopicInput[];
};

const templateInclude = {
  direction: { select: { id: true, title: true, crmDirectionId: true } },
  topics: { orderBy: { sortOrder: "asc" as const } },
} as const;

type TemplateRow = NonNullable<Awaited<ReturnType<typeof loadTemplate>>>;

async function loadTemplate(id: string) {
  return prisma.sectorTemplate.findUnique({ where: { id }, include: templateInclude });
}

export function sectorTemplateDto(row: TemplateRow) {
  const test = row.preparedTestId
    ? listPreparedTestTemplates().find((item) => item.id === row.preparedTestId) ?? null
    : null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    isPublished: row.isPublished,
    direction: row.direction
      ? { crmDirectionId: row.direction.crmDirectionId, title: row.direction.title }
      : null,
    preparedTest: row.preparedTestId
      ? { id: row.preparedTestId, title: test?.title ?? row.preparedTestId, known: Boolean(test) }
      : null,
    topics: row.topics.map((topic) => ({
      id: topic.id,
      line: topic.line,
      title: topic.title,
      masteryCriteria: topic.masteryCriteria,
      materials: Array.isArray(topic.materials) ? topic.materials : [],
    })),
    updatedAt: row.updatedAt,
  };
}

function normalizeTemplateInput(input: SectorTemplateInput) {
  const title = input.title.trim();
  if (!title) throw new BadRequestError("Укажите название ступени", "SECTOR_TEMPLATE_TITLE_REQUIRED");
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 999) {
    throw new BadRequestError("Номер ступени — целое число от 1 до 999", "SECTOR_TEMPLATE_NUMBER_INVALID");
  }
  if (input.preparedTestId && !listPreparedTestTemplates().some((item) => item.id === input.preparedTestId)) {
    throw new BadRequestError("Такого теста нет", "SECTOR_TEMPLATE_TEST_UNKNOWN");
  }
  const topics = input.topics.map((topic, index) => {
    const topicTitle = topic.title.trim();
    if (!topicTitle) throw new BadRequestError(`Тема ${index + 1}: укажите название`, "SECTOR_TEMPLATE_TOPIC_TITLE_REQUIRED");
    return {
      sortOrder: index,
      line: topic.line,
      title: topicTitle.slice(0, 1000),
      masteryCriteria: (topic.masteryCriteria ?? "").trim(),
      materials: (topic.materials ?? [])
        .map((material) => ({ title: material.title.trim(), url: material.url.trim(), note: (material.note ?? "").trim() }))
        .filter((material) => material.title || material.url),
    };
  });
  return { title: title.slice(0, 255), summary: (input.summary ?? "").trim(), number: input.number, preparedTestId: input.preparedTestId || null, topics };
}

async function resolveDirectionId(crmDirectionId: string | null | undefined) {
  if (!crmDirectionId) return null;
  const direction = await prisma.direction.findFirst({ where: { crmDirectionId, deletedAt: null }, select: { id: true } });
  if (!direction) throw new NotFoundError("Направление не найдено");
  return direction.id;
}

export async function listSectorTemplates(filter: { crmDirectionId?: string | null; publishedOnly?: boolean } = {}) {
  const directionId = filter.crmDirectionId ? await resolveDirectionId(filter.crmDirectionId) : null;
  const rows = await prisma.sectorTemplate.findMany({
    where: {
      ...(filter.publishedOnly ? { isPublished: true } : {}),
      ...(directionId ? { OR: [{ directionId }, { directionId: null }] } : {}),
    },
    include: templateInclude,
    orderBy: [{ number: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(sectorTemplateDto);
}

export async function getSectorTemplate(id: string) {
  const row = await loadTemplate(id);
  if (!row) throw new NotFoundError("Ступень не найдена");
  return sectorTemplateDto(row);
}

export async function createSectorTemplate(actorUserId: string, input: SectorTemplateInput) {
  const normalized = normalizeTemplateInput(input);
  const directionId = await resolveDirectionId(input.crmDirectionId);
  const duplicate = await prisma.sectorTemplate.findFirst({ where: { directionId, number: normalized.number }, select: { id: true } });
  if (duplicate) throw new ConflictError("Ступень с таким номером уже есть", "SECTOR_TEMPLATE_NUMBER_TAKEN");
  const created = await prisma.sectorTemplate.create({
    data: {
      directionId,
      number: normalized.number,
      title: normalized.title,
      summary: normalized.summary,
      preparedTestId: normalized.preparedTestId,
      createdById: actorUserId,
      topics: { create: normalized.topics },
    },
    include: templateInclude,
  });
  return sectorTemplateDto(created);
}

export async function updateSectorTemplate(id: string, input: SectorTemplateInput) {
  const existing = await loadTemplate(id);
  if (!existing) throw new NotFoundError("Ступень не найдена");
  const normalized = normalizeTemplateInput(input);
  const directionId = input.crmDirectionId === undefined ? existing.directionId : await resolveDirectionId(input.crmDirectionId);
  const duplicate = await prisma.sectorTemplate.findFirst({
    where: { directionId, number: normalized.number, id: { not: id } },
    select: { id: true },
  });
  if (duplicate) throw new ConflictError("Ступень с таким номером уже есть", "SECTOR_TEMPLATE_NUMBER_TAKEN");
  const updated = await prisma.$transaction(async (tx) => {
    await tx.sectorTemplateTopic.deleteMany({ where: { templateId: id } });
    return tx.sectorTemplate.update({
      where: { id },
      data: {
        directionId,
        number: normalized.number,
        title: normalized.title,
        summary: normalized.summary,
        preparedTestId: normalized.preparedTestId,
        topics: { create: normalized.topics },
      },
      include: templateInclude,
    });
  });
  return sectorTemplateDto(updated);
}

export async function setSectorTemplatePublished(id: string, isPublished: boolean) {
  const existing = await loadTemplate(id);
  if (!existing) throw new NotFoundError("Ступень не найдена");
  if (isPublished && !existing.topics.length) {
    throw new BadRequestError("Добавьте хотя бы одну тему перед публикацией", "SECTOR_TEMPLATE_TOPICS_REQUIRED");
  }
  const updated = await prisma.sectorTemplate.update({ where: { id }, data: { isPublished }, include: templateInclude });
  return sectorTemplateDto(updated);
}
