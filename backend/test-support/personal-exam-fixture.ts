import {randomUUID} from "node:crypto";
import type test from "node:test";

export async function createExamFixture(t: Parameters<Parameters<typeof test>[1]>[0], inQuartet=false) {
  const { prisma } = await import("../src/infrastructure/database/prisma.js");
  const { resetTeacherSubstitutionRefresh } = await import("../src/application/services/teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const suffix = randomUUID().slice(0, 8);
  const existingEpoch = await prisma.economicEpoch.findFirst({ where: { status: "active" } });
  const epoch = existingEpoch ?? await prisma.economicEpoch.create({ data: { code: `exam-${suffix}`, sourceKey: `exam-${suffix}`, name: "Exam test", status: "active", startsAt: new Date("2026-01-01T00:00:00Z") } });
  const digits = suffix.replace(/\D/g, "").padEnd(7, "5").slice(0, 7);
  const crmStudentId = `crm-exam-${suffix}`;
  const crmDirectionId = `crm-dir-exam-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `exam-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `exam_s_${suffix}`, phone: `+7731${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `exam_t_${suffix}`, phone: `+7732${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-exam-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const stranger = await prisma.user.create({
    data: {
      login: `exam_x_${suffix}`, phone: `+7733${digits}`, passwordHash: "x",
      firstName: "Чужой", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-stranger-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const extraStudents: Array<{id:string;crmStudentId:string}> = [];
  const rosterStudents = [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: !inQuartet, groups: inQuartet?[{crmGroupId:`quartet-${suffix}`,name:"Квартет",direction:direction.title,level:""}]:[], schedules: [], attendanceHistory: [], memberships: [] }];
  t.after(async () => {
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.sectorExamSession.deleteMany({ where: { program: { directionId: direction.id } } });
    await prisma.sectorExamProgram.deleteMany({ where: { directionId: direction.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: {in:[student.id,...extraStudents.map(user=>user.id)]} } });
    await prisma.learningSectorEvent.deleteMany({ where: { plan: { directionId: direction.id } } });
    await prisma.learningHomeworkAssignment.deleteMany({ where: { topic: { directionId: direction.id } } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id, stranger.id,...extraStudents.map(user=>user.id)] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, stranger.id,...extraStudents.map(user=>user.id)] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
    if (!existingEpoch) await prisma.economicEpoch.delete({ where: { id: epoch.id } });
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const own = url.includes(`/teachers/${teacher.crmTeacherId}/`);
    const body = url.includes("/directions")
      ? { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] }
      : url.includes("/offline-classes")
        ? { classes: [] }
        : { teacher: { crmTeacherId: "x", name: "Учитель", directions: [direction.title] },
            students: own ? rosterStudents : [],
            groups: [] };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const plans = await import("../src/application/services/learning-plan-v2.service.js");
  const draft = await plans.saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Первые аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [
      { id: "topic-a", title: "Am и E", status: "planned", masteryCriteria: "Смена без пауз" },
      { id: "topic-b", title: "Бой восьмыми", status: "planned", masteryCriteria: "Две минуты под метроном" },
    ],
    expectedVersion: 0,
  });
  const published = await plans.publishStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, draft.version);
  const topicIds = published.items.map((item) => item.id);
  const allTopicsDone = () => prisma.learningTopic.updateMany({ where: { id: { in: topicIds } }, data: { progressPercent: 100 } });
  const markReady = async () => {
    const { applyApprovedSectorReadiness } = await import("../src/application/services/sector-readiness.service.js");
    return applyApprovedSectorReadiness({planIds:[published.id], recipientCrmStudentIds:[crmStudentId],
      crmClassId:`ready-${suffix}`, actorUserId:teacher.id, reportVersion:1, eventAt:new Date()});
  };
  const addStudent = async () => {
    const id=randomUUID(); const nextCrmId=`extra-${id}`;
    const next=await prisma.user.create({data:{login:`extra-${id}`,phone:id.slice(0,20),passwordHash:"x",firstName:"Участник",lastName:String(extraStudents.length+2),roleId:studentRole.id,crmStudentId:nextCrmId}});
    extraStudents.push({id:next.id,crmStudentId:nextCrmId});
    rosterStudents.push({...rosterStudents[0]!,crmStudentId:nextCrmId,name:`Участник ${extraStudents.length+1}`});
    const draft=await plans.saveStudentLearningPlanV2(teacher.id,nextCrmId,crmDirectionId,{goal:"Сектор",expectedResult:"",skills:"",checkpoint:"",note:"",items:[{id:"a",title:"Тема сектора",status:"planned"}],expectedVersion:0});
    const plan=await plans.publishStudentLearningPlanV2(teacher.id,nextCrmId,crmDirectionId,draft.version);
    return {student:next,planId:plan.id,crmStudentId:nextCrmId};
  };
  return { markReady, prisma, suffix, crmStudentId, crmDirectionId, student, teacher, stranger, planId: published.id, topicIds, allTopicsDone, plans, addStudent };
}
