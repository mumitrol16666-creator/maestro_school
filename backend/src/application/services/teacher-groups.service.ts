import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchTeacherGroups } from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { productFeatureConfig } from "../../config/product-features.js";

export async function listTeacherGroups(appTeacherId: string) {
  const crmTeacherId = await requireCrmTeacherId(appTeacherId);
  const roster = await fetchTeacherGroups(crmTeacherId);
  const month = aqtobeMonthKey();
  const groupIds = roster.groups.map((group) => group.crmGroupId);
  const sectorsEnabled = productFeatureConfig.flags.learningTopicsV2;

  // Sectors: the open sector of each group, any direction.
  const sectors = sectorsEnabled && groupIds.length
    ? await prisma.learningPlan.findMany({
        where: { crmGroupId: { in: groupIds }, crmStudentId: null, status: "active" },
        include: {
          versions: { include: { topics: { include: { topic: { select: { progressPercent: true } } } } } },
        },
      })
    : [];
  const sectorByGroup = new Map<string, typeof sectors[number]>();
  for (const sector of sectors) {
    if (sector.crmGroupId && !sectorByGroup.has(sector.crmGroupId)) sectorByGroup.set(sector.crmGroupId, sector);
  }


  return {
    teacher: roster.teacher,
    groups: roster.groups.map((group) => {
      const sector = sectorByGroup.get(group.crmGroupId);
      if (sector) {
        const version = sector.versions.find((item) => item.version === (sector.publishedVersionNumber ?? sector.currentVersionNumber));
        const topics = (version?.topics ?? []).filter((link) => link.state === "active");
        const completed = topics.filter((link) => link.topic.progressPercent === 100).length;
        return {
          ...group,
          planSummary: {
            month,
            sequence: sector.sequence,
            configured: sector.publishedVersionNumber !== null,
            itemsTotal: topics.length,
            itemsCompleted: completed,
            completionRate: topics.length ? Math.round((completed / topics.length) * 100) : null,
          },
        };
      }
      return {
        ...group,
        planSummary: {
          month,
          sequence: null,
          configured: false,
          itemsTotal: 0,
          itemsCompleted: 0,
          completionRate: null,
        },
      };
    }),
  };
}
