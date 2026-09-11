import { createHash } from "node:crypto";
import type { CrmDirectionRef } from "../../infrastructure/crm/crm-client.js";
import {
  fetchCrmDirections,
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import {
  assignedCrmDirectionId,
  isAssignedCrmDirectionId,
  mergeAssignedCrmDirections,
  normalizeCrmDirectionTitle,
  ASSIGNED_CRM_DIRECTION_UPDATED_AT,
} from "../../domain/crm-direction-title.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

function projectionSlug(crmDirectionId: string) {
  const digest = createHash("sha256").update(crmDirectionId).digest("hex").slice(0, 24);
  return `crm-${digest}`;
}

function parsedCrmUpdatedAt(direction: CrmDirectionRef) {
  const updatedAt = new Date(direction.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ConflictError(
      "CRM вернула некорректную версию направления",
      "CRM_DIRECTION_VERSION_INVALID",
    );
  }
  return updatedAt;
}

export async function requireCrmDirection(
  crmDirectionId: string,
  allowedTitles: readonly string[],
) {
  const catalog = await fetchCrmDirections();
  const normalizedAllowedTitles = new Set(allowedTitles.map(normalizeCrmDirectionTitle));
  const catalogDirection = catalog.directions.find((item) => item.crmDirectionId === crmDirectionId);
  const assignedTitle = allowedTitles.find((title) => assignedCrmDirectionId(title) === crmDirectionId);
  const direction = catalogDirection ?? (assignedTitle ? {
    crmDirectionId,
    title: assignedTitle.trim(),
    isActive: true,
    updatedAt: ASSIGNED_CRM_DIRECTION_UPDATED_AT,
  } satisfies CrmDirectionRef : null);
  if (!direction) {
    throw new BadRequestError(
      "Направление больше не найдено в CRM",
      "CRM_DIRECTION_NOT_FOUND",
    );
  }
  if (!direction.isActive) {
    throw new ConflictError(
      "Направление архивировано в CRM. Новый план сохранить нельзя.",
      "CRM_DIRECTION_INACTIVE",
    );
  }
  if (!normalizedAllowedTitles.has(normalizeCrmDirectionTitle(direction.title))) {
    throw new BadRequestError(
      "Это направление не назначено преподавателю для выбранного ученика или группы",
      "CRM_DIRECTION_NOT_ASSIGNED",
    );
  }
  return direction;
}

export async function syncCrmDirectionProjection(direction: CrmDirectionRef) {
  const crmUpdatedAt = parsedCrmUpdatedAt(direction);
  const syncedAt = new Date();
  const existing = await prisma.direction.findUnique({
    where: { crmDirectionId: direction.crmDirectionId },
  });

  if (existing) {
    const stale = existing.crmUpdatedAt && existing.crmUpdatedAt > crmUpdatedAt;
    if (stale) {
      return prisma.direction.update({
        where: { id: existing.id },
        data: { crmSyncedAt: syncedAt },
      });
    }
    return prisma.direction.update({
      where: { id: existing.id },
      data: {
        title: direction.title,
        crmIsActive: direction.isActive,
        crmUpdatedAt,
        crmSyncedAt: syncedAt,
      },
    });
  }

  const localDirections = await prisma.direction.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const titleMatches = localDirections.filter((item) => (
    normalizeCrmDirectionTitle(item.title) === normalizeCrmDirectionTitle(direction.title)
  ));
  const titleMatch = titleMatches[0];
  const canBindTitleMatch = titleMatches.length === 1 && (
    !titleMatch.crmDirectionId
    || (isAssignedCrmDirectionId(titleMatch.crmDirectionId) && !isAssignedCrmDirectionId(direction.crmDirectionId))
  );
  if (canBindTitleMatch) {
    return prisma.direction.update({
      where: { id: titleMatch.id },
      data: {
        crmDirectionId: direction.crmDirectionId,
        title: direction.title,
        crmIsActive: direction.isActive,
        crmUpdatedAt,
        crmSyncedAt: syncedAt,
      },
    });
  }
  if (
    titleMatches.length === 1
    && isAssignedCrmDirectionId(direction.crmDirectionId)
    && titleMatch.crmDirectionId
    && !isAssignedCrmDirectionId(titleMatch.crmDirectionId)
  ) {
    return prisma.direction.update({
      where: { id: titleMatch.id },
      data: { crmSyncedAt: syncedAt },
    });
  }
  if (titleMatches.length) {
    throw new ConflictError(
      "Направление CRM неоднозначно связано с локальным каталогом. Нужна ручная сверка.",
      "CRM_DIRECTION_MAPPING_CONFLICT",
    );
  }

  return prisma.direction.create({
    data: {
      crmDirectionId: direction.crmDirectionId,
      crmIsActive: direction.isActive,
      crmUpdatedAt,
      crmSyncedAt: syncedAt,
      title: direction.title,
      slug: projectionSlug(direction.crmDirectionId),
      isPublished: false,
    },
  });
}

export async function listAdminCrmDirectionProjection(input: {
  page: number;
  limit: number;
  search?: string;
}) {
  const catalog = await fetchCrmDirections();
  const projections = await Promise.all(
    catalog.directions.map((direction) => syncCrmDirectionProjection(direction)),
  );
  const normalizedSearch = input.search?.trim().toLocaleLowerCase("ru") ?? "";
  const filtered = projections
    .filter((direction) => (
      !normalizedSearch
      || direction.title.toLocaleLowerCase("ru").includes(normalizedSearch)
    ))
    .sort((left, right) => left.title.localeCompare(right.title, "ru"));
  const start = (input.page - 1) * input.limit;
  return {
    items: filtered.slice(start, start + input.limit),
    total: filtered.length,
  };
}

export async function listTeacherCrmDirections(teacherUserId: string) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const [catalog, roster, groupRoster] = await Promise.all([
    fetchCrmDirections(),
    fetchTeacherStudents(crmTeacherId),
    fetchTeacherGroups(crmTeacherId),
  ]);
  const assignedTitles = [
    ...(roster.teacher?.directions ?? []),
    ...roster.students.flatMap((student) => student.directions),
    ...groupRoster.groups.map((group) => group.direction),
  ];
  const directions = mergeAssignedCrmDirections(catalog.directions, assignedTitles);
  const projections = await Promise.all(directions.map(async (direction) => ({
    direction,
    projection: await syncCrmDirectionProjection(direction),
  })));
  return projections.map(({ direction, projection }) => ({
    id: projection.id,
    crmDirectionId: direction.crmDirectionId,
    title: direction.title,
    isActive: projection.crmIsActive,
    updatedAt: projection.crmUpdatedAt,
    syncedAt: projection.crmSyncedAt,
  }));
}
