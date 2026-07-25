import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchTeacherGroups } from "../../infrastructure/crm/crm-client.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

export async function listTeacherGroups(appTeacherId: string) {
  const crmTeacherId = await requireCrmTeacherId(appTeacherId);
  const roster = await fetchTeacherGroups(crmTeacherId);
  const month = new Date().toISOString().slice(0, 7);
  const groupIds = roster.groups.map((group) => group.crmGroupId);
  const plans = groupIds.length
    ? await prisma.groupMonthlyPlan.findMany({
        where: {
          teacherUserId: appTeacherId,
          crmGroupId: { in: groupIds },
          month,
        },
      })
    : [];
  const planByGroup = new Map(plans.map((plan) => [plan.crmGroupId, plan]));

  return {
    teacher: roster.teacher,
    groups: roster.groups.map((group) => {
      const plan = planByGroup.get(group.crmGroupId);
      const items = Array.isArray(plan?.items)
        ? plan.items as Array<{ status?: string }>
        : [];
      const completed = items.filter((item) => item.status === "completed").length;

      return {
        ...group,
        planSummary: {
          month,
          configured: Boolean(plan),
          itemsTotal: items.length,
          itemsCompleted: completed,
          completionRate: items.length ? Math.round((completed / items.length) * 100) : null,
        },
      };
    }),
  };
}
