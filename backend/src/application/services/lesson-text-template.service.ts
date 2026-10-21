import type { LessonTextTemplateKind } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";

/**
 * Plan 1.14: phrases a teacher taps into the lesson summary and homework. Each teacher keeps their
 * own; the school keeps a set per CRM direction (no direction = every direction), edited by an admin.
 */
export const OWN_TEMPLATES_PER_KIND = 60;

export type LessonTextTemplateDto = {
  id: string;
  kind: LessonTextTemplateKind;
  text: string;
  scope: "own" | "school";
  crmDirectionId: string | null;
  sortOrder: number;
};

type TemplateRow = {
  id: string;
  kind: LessonTextTemplateKind;
  text: string;
  ownerId: string | null;
  crmDirectionId: string | null;
  sortOrder: number;
};

function templateDto(row: TemplateRow): LessonTextTemplateDto {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    scope: row.ownerId ? "own" : "school",
    crmDirectionId: row.crmDirectionId,
    sortOrder: row.sortOrder,
  };
}

export function normalizeTemplateText(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || value.length > 500) {
    throw new BadRequestError("Шаблон: от 1 до 500 символов", "LESSON_TEMPLATE_TEXT_INVALID");
  }
  return value;
}

function normalizeDirection(crmDirectionId?: string | null) {
  const value = crmDirectionId?.trim();
  return value ? value.slice(0, 64) : null;
}

const order = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** What a teacher sees in the lesson: their own phrases and the school's for the lesson direction. */
export async function listLessonTemplatesForTeacher(userId: string, input: { crmDirectionId?: string | null } = {}) {
  const direction = normalizeDirection(input.crmDirectionId);
  const [own, school] = await Promise.all([
    prisma.lessonTextTemplate.findMany({ where: { ownerId: userId, archivedAt: null }, orderBy: order }),
    prisma.lessonTextTemplate.findMany({
      where: {
        ownerId: null,
        archivedAt: null,
        OR: direction ? [{ crmDirectionId: direction }, { crmDirectionId: null }] : [{ crmDirectionId: null }],
      },
      orderBy: order,
    }),
  ]);
  return { own: own.map(templateDto), school: school.map(templateDto) };
}

/** «Сохранить как шаблон»: the same phrase twice stays one template. */
export async function addOwnLessonTemplate(userId: string, input: { kind: LessonTextTemplateKind; text: string }) {
  const text = normalizeTemplateText(input.text);
  const existing = await prisma.lessonTextTemplate.findFirst({
    where: { ownerId: userId, kind: input.kind, text, archivedAt: null },
  });
  if (existing) return { item: templateDto(existing), duplicate: true };
  const count = await prisma.lessonTextTemplate.count({ where: { ownerId: userId, kind: input.kind, archivedAt: null } });
  if (count >= OWN_TEMPLATES_PER_KIND) {
    throw new BadRequestError(`Своих шаблонов не больше ${OWN_TEMPLATES_PER_KIND}. Удалите ненужные.`, "LESSON_TEMPLATE_LIMIT");
  }
  const created = await prisma.lessonTextTemplate.create({
    data: { kind: input.kind, text, ownerId: userId, sortOrder: count },
  });
  return { item: templateDto(created), duplicate: false };
}

export async function archiveOwnLessonTemplate(userId: string, id: string) {
  const row = await prisma.lessonTextTemplate.findFirst({ where: { id, archivedAt: null } });
  if (!row) throw new NotFoundError("Шаблон не найден");
  if (row.ownerId !== userId) throw new ForbiddenError("Удалить можно только свой шаблон");
  await prisma.lessonTextTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
  return { id };
}

/** The admin's list of school phrases; `crmDirectionId` narrows to one direction plus the shared ones. */
export async function listSchoolLessonTemplates(input: { crmDirectionId?: string | null } = {}) {
  const direction = normalizeDirection(input.crmDirectionId);
  const rows = await prisma.lessonTextTemplate.findMany({
    where: {
      ownerId: null,
      archivedAt: null,
      ...(direction ? { OR: [{ crmDirectionId: direction }, { crmDirectionId: null }] } : {}),
    },
    orderBy: [{ kind: "asc" }, ...order],
  });
  return rows.map(templateDto);
}

export async function addSchoolLessonTemplate(input: {
  kind: LessonTextTemplateKind;
  text: string;
  crmDirectionId?: string | null;
  sortOrder?: number;
}) {
  const text = normalizeTemplateText(input.text);
  const crmDirectionId = normalizeDirection(input.crmDirectionId);
  const existing = await prisma.lessonTextTemplate.findFirst({
    where: { ownerId: null, kind: input.kind, text, crmDirectionId, archivedAt: null },
  });
  if (existing) return { item: templateDto(existing), duplicate: true };
  const sortOrder = input.sortOrder
    ?? await prisma.lessonTextTemplate.count({ where: { ownerId: null, kind: input.kind, crmDirectionId, archivedAt: null } });
  const created = await prisma.lessonTextTemplate.create({ data: { kind: input.kind, text, crmDirectionId, sortOrder } });
  return { item: templateDto(created), duplicate: false };
}

async function requireSchoolTemplate(id: string) {
  const row = await prisma.lessonTextTemplate.findFirst({ where: { id, ownerId: null, archivedAt: null } });
  if (!row) throw new NotFoundError("Шаблон школы не найден");
  return row;
}

export async function updateSchoolLessonTemplate(id: string, input: { text?: string; crmDirectionId?: string | null; sortOrder?: number }) {
  await requireSchoolTemplate(id);
  const updated = await prisma.lessonTextTemplate.update({
    where: { id },
    data: {
      ...(input.text !== undefined ? { text: normalizeTemplateText(input.text) } : {}),
      ...(input.crmDirectionId !== undefined ? { crmDirectionId: normalizeDirection(input.crmDirectionId) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  return templateDto(updated);
}

export async function archiveSchoolLessonTemplate(id: string) {
  await requireSchoolTemplate(id);
  await prisma.lessonTextTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
  return { id };
}
