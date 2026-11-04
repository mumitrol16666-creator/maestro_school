import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-exam-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";
for(const feature of ["LEARNING_TOPICS","HOMEWORK_FLOW","LESSON_SYNC","UNIFIED_LESSON","REWARD_ECONOMY"]) process.env[`FEATURE_${feature}_V2`] = "true";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { resetTeacherSubstitutionRefresh } = await import("./teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const suffix = randomUUID().slice(0, 8);
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
  t.after(async () => {
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.sectorExamSession.deleteMany({ where: { program: { directionId: direction.id } } });
    await prisma.sectorExamProgram.deleteMany({ where: { directionId: direction.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.learningSectorEvent.deleteMany({ where: { plan: { directionId: direction.id } } });
    await prisma.learningHomeworkAssignment.deleteMany({ where: { topic: { directionId: direction.id } } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id, stranger.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, stranger.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const own = url.includes(`/teachers/${teacher.crmTeacherId}/`);
    const body = url.includes("/directions")
      ? { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] }
      : url.includes("/offline-classes")
        ? { classes: [] }
        : { teacher: { crmTeacherId: "x", name: "Учитель", directions: [direction.title] },
            students: own ? [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [] }] : [],
            groups: [] };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const plans = await import("./learning-plan-v2.service.js");
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
    const { applyApprovedSectorReadiness } = await import("./sector-readiness.service.js");
    return applyApprovedSectorReadiness({planIds:[published.id], recipientCrmStudentIds:[crmStudentId],
      crmClassId:`ready-${suffix}`, actorUserId:teacher.id, reportVersion:1, eventAt:new Date()});
  };
  return { markReady, prisma, suffix, crmStudentId, crmDirectionId, student, teacher, stranger, planId: published.id, topicIds, allTopicsDone, plans };
}

const rejectsWith = (code: string) => (error: { code?: string }) => {
  assert.equal(error.code, code);
  return true;
};

integrationTest("the exam starts after CRM scheduling and explicit readiness with incomplete topics, then issues a certificate", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");

  const template = await exams.sectorExamTemplate(f.planId);
  assert.deepEqual(template.items.map((item) => [item.kind, item.title, item.criteria]), [
    ["topic", "Am и E", "Смена без пауз"],
    ["topic", "Бой восьмыми", "Две минуты под метроном"],
  ]);
  const exam = await exams.createSectorExam(f.teacher.id, {
    planId: f.planId,
    items: [...template.items, { kind: "custom", title: "Сыграть песню целиком", criteria: "С вокалом" }],
  });
  assert.equal(exam.status, "draft");
  await assert.rejects(exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items }), rejectsWith("SECTOR_EXAM_ALREADY_OPEN"));
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("SECTOR_EXAM_NOT_SCHEDULED"));

  await exams.sendSectorExamForSchedule(exam.id);
  const pending = await exams.listSectorExamsAwaitingSchedule();
  assert.ok(pending.some((item) => item.examId === exam.id && item.itemsCount === 3), "CRM sees it in the queue");

  const lessonAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt, crmTeacherId: f.teacher.crmTeacherId });
  const told = await f.prisma.userNotification.findFirst({ where: { userId: f.student.id, type: "sector_exam_updated" } });
  assert.ok(told, "the student is told the exam date");
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("SECTOR_EXAM_NOT_READY"));
  await assert.rejects(exams.startSectorExam(f.stranger.id, exam.id), (error: { statusCode?: number }) => error.statusCode === 403);

  // Topics at 100 % do not close an individual sector on their own any more.
  await f.markReady();
  const still = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, []);
  assert.equal(still[0]?.status, "active");
  assert.equal(still[0]?.exam?.status, "scheduled");
  assert.equal(still[0]?.exam?.scheduledAt?.toISOString(), lessonAt.toISOString());

  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  assert.equal(started.status, "in_progress");
  for (const item of started.items.slice(0, 2)) await exams.markSectorExamItem(f.teacher.id, exam.id, item.id, true);
  await assert.rejects(
    exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" }),
    rejectsWith("SECTOR_EXAM_ITEMS_UNMARKED"),
  );
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[2]!.id, true);

  const finished = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" });
  assert.equal(finished.exam.outcome, "passed");
  assert.match(finished.exam.certificate?.number ?? "", /^MS-\d{4}-[0-9A-F]{8}$/);
  assert.equal(finished.awardedPoints, 250);
  const again = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" });
  assert.equal(again.awardedPoints, 0, "repeating the result pays nothing");
  const points = await f.prisma.pointsTransaction.findMany({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } });
  assert.deepEqual(points.map((row) => row.amount), [250]);

  const history = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, [], { includeClosed: true });
  assert.equal(history[0]?.status, "closed");
  assert.deepEqual(history[0]?.exam?.items.map((item) => item.done), [true, true, true]);
  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.closeReason, "exam");
});

integrationTest("a retake keeps the sector open and queues a new exam with the same points", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  await f.markReady();
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt: new Date() });
  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[0]!.id, true);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[1]!.id, false);

  const result = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "retake", comment: "Бой пока неровный" });
  assert.equal(result.exam.outcome, "partial");
  assert.equal(result.exam.certificate, null);
  assert.ok(result.retakeExamId);
  const retake = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: result.retakeExamId! }, include: { items: true } });
  assert.equal(retake.status, "awaiting_schedule");
  assert.equal(retake.attempt, 2);
  assert.equal(retake.previousExamId, exam.id);
  assert.deepEqual(retake.items.map((item) => item.title).sort(), started.items.map((item) => item.title).sort());

  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.status, "active");
  assert.equal(await f.prisma.pointsTransaction.count({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } }), 0);

  const teacherView = await exams.listTeacherStudentSectorExams(f.teacher.id, f.crmStudentId);
  assert.equal(teacherView[0]?.exam?.attempt, 2);
  assert.equal(teacherView[0]?.previousExam?.outcome, "partial");
  assert.equal(teacherView[0]?.canStart, false, "the retake waits for CRM to book it");

  // A failed exam cannot close the sector or issue its reward.
  await exams.scheduleSectorExamFromCrm(retake.id, { crmClassId: `exam-2-${f.suffix}`, lessonAt: new Date() });
  const second = await exams.startSectorExam(f.teacher.id, retake.id);
  for (const item of second.items) await exams.markSectorExamItem(f.teacher.id, retake.id, item.id, false);
  await assert.rejects(exams.finishSectorExam(f.teacher.id, retake.id, { decision: "close_sector" }), rejectsWith("SECTOR_EXAM_NOT_PASSED"));
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:retake.id}})).status,"in_progress");
  const failed = await exams.finishSectorExam(f.teacher.id, retake.id, { decision: "retake" });
  assert.equal(failed.exam.outcome, "failed");
  assert.equal(failed.exam.certificate, null);
  assert.equal(failed.awardedPoints, 0);
  assert.ok(failed.retakeExamId);
});

integrationTest("an early close cancels the exam prepared for the sector", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await f.plans.closeStudentSectorEarlyV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, { points: 0 });
  const cancelled = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await exams.listSectorExamsAwaitingSchedule()).some((item) => item.examId === exam.id), false);
  await assert.rejects(
    exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items }),
    rejectsWith("SECTOR_ALREADY_CLOSED"),
  );
});

integrationTest("a cancelled exam lesson in CRM puts the exam back in the queue; a moved one moves its date", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt: new Date("2099-01-10T07:00:00.000Z") });

  const moved = await exams.applyCrmLessonEventToSectorExams({
    event: "rescheduled", crmClassId: `exam-${f.suffix}`, date: "12.01.2099", startTime: "15:30",
  });
  assert.equal(moved?.[0]?.status, "scheduled");
  const afterMove = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(afterMove.scheduledAt?.toISOString(), "2099-01-12T10:30:00.000Z");

  await exams.applyCrmLessonEventToSectorExams({ event: "cancelled", crmClassId: `exam-${f.suffix}` });
  const back = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(back.status, "awaiting_schedule");
  assert.equal(back.crmClassId, null);
  assert.ok((await exams.listSectorExamsAwaitingSchedule()).some((item) => item.examId === exam.id));
});


integrationTest("a teacher opens the next sector before the exam without completing topics or awarding points", async t => {
  const f = await createFixture(t);
  const before = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  const request = { planId: f.planId, expectedVersion: before.currentVersionNumber };
  await assert.rejects(f.plans.openNextStudentSector(f.stranger.id, f.crmStudentId, f.crmDirectionId, request));
  const [next, replay] = await Promise.all([
    f.plans.openNextStudentSector(f.teacher.id, f.crmStudentId, f.crmDirectionId, request),
    f.plans.openNextStudentSector(f.teacher.id, f.crmStudentId, f.crmDirectionId, request),
  ]);
  assert.equal(next.id, replay.id, "a retried click must not open sector 3");
  assert.equal(next.sequence, 2);
  assert.equal(next.publication.isPublished, false);
  const previous = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(previous.status, "awaiting_exam");
  assert.ok(previous.studyFinishedAt);
  assert.equal(previous.examReadyAt, null, "moving on does not claim readiness");
  assert.equal(previous.studyStartedAt, null, "unknown historical dates remain unknown");
  assert.equal(await f.prisma.pointsTransaction.count({ where: { studentId: f.student.id } }), 0);
  assert.deepEqual((await f.prisma.learningTopic.findMany({where:{id:{in:f.topicIds}}})).map(x=>x.progressPercent), [0,0]);
  const shown = await f.plans.getStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId);
  assert.equal(shown.plan?.id, next.id);
  assert.equal(shown.history[0]?.status, "awaiting_exam");
  const events = await f.prisma.learningSectorEvent.findMany({ where: { planId: { in: [f.planId, next.id] } } });
  assert.equal(events.length, 2);
  assert.ok(events.every(x => x.actorUserId === f.teacher.id));
});

integrationTest("an unpublished edit cannot be lost when opening the next sector", async t => {
  const f = await createFixture(t);
  const current = await f.plans.getStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId);
  const saved = await f.plans.saveStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, {
    ...current.plan!, goal: "Новая неопубликованная цель", expectedVersion: current.plan!.version,
    items: current.plan!.items.map(x=>({id:x.id,title:x.title,status:x.status === "moved" ? "planned" : x.status})),
  });
  await assert.rejects(f.plans.openNextStudentSector(f.teacher.id, f.crmStudentId, f.crmDirectionId, {
    planId: f.planId, expectedVersion: saved.version,
  }), rejectsWith("SECTOR_PUBLISH_BEFORE_NEXT"));
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).status, "active");
});


integrationTest("an exam of a previous sector can be held while the next sector is being studied", async t => {
  const f = await createFixture(t);
  await f.markReady();
  const current = await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  const next = await f.plans.openNextStudentSector(f.teacher.id, f.crmStudentId, f.crmDirectionId, {planId:f.planId,expectedVersion:current.currentVersionNumber});
  const exams = await import("./sector-exam.service.js");
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id,{planId:f.planId,items:template.items,send:true});
  await exams.scheduleSectorExamFromCrm(exam.id,{crmClassId:`after-next-${f.suffix}`,lessonAt:new Date()});
  const started = await exams.startSectorExam(f.teacher.id,exam.id);
  for (const item of started.items) await exams.markSectorExamItem(f.teacher.id,exam.id,item.id,true);
  const finished = await exams.finishSectorExam(f.teacher.id,exam.id,{decision:"close_sector"});
  assert.equal(finished.awardedPoints,250);
  assert.ok(finished.exam.certificate);
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:next.id}})).status,"active");
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).status,"closed");
});

integrationTest("returning a readiness report preserves another report's confirmation and reapproval is idempotent", async t => {
  const f = await createFixture(t);
  const {applyApprovedSectorReadiness,reverseSectorReadiness} = await import("./sector-readiness.service.js");
  const first={planIds:[f.planId],recipientCrmStudentIds:[f.crmStudentId],crmClassId:`ready-a-${f.suffix}`,actorUserId:f.teacher.id,reportVersion:1,eventAt:new Date("2026-11-01T09:00:00Z")};
  await applyApprovedSectorReadiness(first);
  await applyApprovedSectorReadiness({...first,crmClassId:`ready-b-${f.suffix}`,eventAt:new Date("2026-11-02T09:00:00Z")});
  await f.prisma.$transaction(tx=>reverseSectorReadiness(tx,first.crmClassId,1,f.teacher.id,new Date()));
  let plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  assert.equal(plan.examReadyAt?.toISOString(),"2026-11-02T09:00:00.000Z");
  await f.prisma.$transaction(tx=>reverseSectorReadiness(tx,`ready-b-${f.suffix}`,1,f.teacher.id,new Date()));
  plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  assert.equal(plan.examReadyAt,null);
  await applyApprovedSectorReadiness({...first,reportVersion:2});
  await applyApprovedSectorReadiness({...first,reportVersion:2});
  assert.equal(await f.prisma.learningSectorEvent.count({where:{planId:f.planId,kind:"exam_ready"}}),3);
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).examReadyAt?.toISOString(),first.eventAt.toISOString());
});


integrationTest("a reusable program creates an immutable participant exam and sending only queues it in CRM", async t => {
  const f = await createFixture(t);
  await f.markReady();
  const {saveExamProgram,createExamSession,sendExamSession}=await import("./sector-exam-program.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  const data={directionId,sectorNumber:1,title:"Первый сектор",durationMinutes:20,items:[{title:"Сыграть песню",criteria:"Без остановок"}]};
  const program=await saveExamProgram(f.teacher.id,data);
  const request={programId:program.id,programRevision:1,title:"Ноябрьский экзамен",planIds:[f.planId],requestKey:randomUUID()};
  const [session,replay]=await Promise.all([createExamSession(f.teacher.id,request),createExamSession(f.teacher.id,request)]);
  assert.equal(session.id,replay.id);
  assert.equal(session.exams.length,1);
  assert.equal(session.exams[0]?.status,"draft");
  assert.equal(session.exams[0]?.scheduledAt,null,"no calendar appointment is created automatically");
  await assert.rejects(createExamSession(f.teacher.id,{...request,title:"Другие условия"}),rejectsWith("EXAM_SESSION_REQUEST_CHANGED"));
  await saveExamProgram(f.teacher.id,{...data,items:[{title:"Новое задание",criteria:"Другой критерий"}]},program.id,1);
  const saved=await f.prisma.sectorExam.findUniqueOrThrow({where:{id:session.exams[0]!.id},include:{items:true}});
  assert.deepEqual(saved.items.map(x=>[x.title,x.criteria]),[["Сыграть песню","Без остановок"]]);
  assert.equal(saved.studentNameSnapshot,`${f.suffix} Ученик`);
  const sent=await sendExamSession(session.id);
  assert.equal(sent.exams[0]?.status,"awaiting_schedule");
  const again=await sendExamSession(session.id);
  assert.equal(again.exams[0]?.id,sent.exams[0]?.id);
  const {listSectorExamsAwaitingSchedule}=await import("./sector-exam.service.js");
  const queued=(await listSectorExamsAwaitingSchedule()).find(x=>x.examId===saved.id);
  assert.equal(queued?.sessionId,session.id);
  assert.equal(queued?.sessionTitle,"Ноябрьский экзамен");
  assert.equal(queued?.durationMinutes,20);
});

integrationTest("a stale program or unready student cannot produce a partial exam session", async t => {
  const f=await createFixture(t);
  const {saveExamProgram,createExamSession}=await import("./sector-exam-program.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  const data={directionId,sectorNumber:1,title:"Проверка",durationMinutes:15,items:[{title:"Ритм",criteria:"Счёт"}]};
  const program=await saveExamProgram(f.teacher.id,data);
  const request={programId:program.id,programRevision:1,title:"Проверка",planIds:[f.planId],requestKey:randomUUID()};
  await assert.rejects(createExamSession(f.teacher.id,request),rejectsWith("EXAM_SESSION_STUDENT_NOT_READY"));
  assert.equal(await f.prisma.sectorExamSession.count({where:{programId:program.id}}),0);
  await f.markReady();
  await saveExamProgram(f.teacher.id,{...data,title:"Обновлённая"},program.id,1);
  await assert.rejects(createExamSession(f.teacher.id,{...request,requestKey:randomUUID()}),rejectsWith("EXAM_PROGRAM_STALE"));
  assert.equal(await f.prisma.sectorExam.count({where:{planId:f.planId}}),0);
});


integrationTest("study statistics count confirmed observations and exclude reversed reports", async t => {
  const f=await createFixture(t);
  const {recordApprovedSectorStudy,reverseSectorStudy,studentSectorStatistics}=await import("./sector-study.service.js");
  const input={planIds:[f.planId],crmClassId:`study-a-${f.suffix}`,reportVersion:1,actorUserId:f.teacher.id,eventAt:new Date("2026-11-01T06:00:00Z"),recipientCrmStudentIds:[f.crmStudentId]};
  await recordApprovedSectorStudy(input);
  await recordApprovedSectorStudy(input);
  await recordApprovedSectorStudy({...input,crmClassId:`study-b-${f.suffix}`,eventAt:new Date("2026-11-03T06:00:00Z")});
  const {applyApprovedSectorReadiness}=await import("./sector-readiness.service.js");
  await applyApprovedSectorReadiness({...input,eventAt:new Date("2026-11-04T06:00:00Z")});
  let stat=(await studentSectorStatistics(f.crmStudentId,new Date("2026-11-08T06:00:00Z")))[0]!;
  assert.equal(stat.observedLessons,2);
  assert.equal(stat.studyDays,4);
  assert.equal(stat.examWaitingDays,4);
  await f.prisma.$transaction(tx=>reverseSectorStudy(tx,input.crmClassId,1,f.teacher.id,new Date()));
  stat=(await studentSectorStatistics(f.crmStudentId,new Date("2026-11-08T06:00:00Z")))[0]!;
  assert.equal(stat.observedLessons,1);
  assert.equal(stat.studyDays,2);
  assert.equal(stat.startedAt?.toISOString(),"2026-11-03T06:00:00.000Z");
});

integrationTest("certificate identity is frozen and parent visibility is checked on every read", async t => {
  const f=await createFixture(t);
  await f.markReady();
  const exams=await import("./sector-exam.service.js");
  const created=await exams.createSectorExam(f.teacher.id,{planId:f.planId,items:(await exams.sectorExamTemplate(f.planId)).items,send:true});
  await exams.scheduleSectorExamFromCrm(created.id,{crmClassId:`cert-${f.suffix}`,lessonAt:new Date()});
  const started=await exams.startSectorExam(f.teacher.id,created.id);
  for(const item of started.items) await exams.markSectorExamItem(f.teacher.id,created.id,item.id,true);
  await exams.finishSectorExam(f.teacher.id,created.id,{decision:"close_sector"});
  const {getSectorCertificate}=await import("./sector-certificate.service.js");
  const issued=await getSectorCertificate(f.student.id,created.id);
  await f.prisma.user.update({where:{id:f.student.id},data:{firstName:"Другое имя"}});
  assert.equal((await getSectorCertificate(f.student.id,created.id)).studentName,issued.studentName);
  await assert.rejects(getSectorCertificate(f.stranger.id,created.id));
  const role=await f.prisma.role.upsert({where:{slug:"parent"},create:{slug:"parent",name:"Родитель"},update:{}});
  const parent=await f.prisma.user.create({data:{login:`cert_parent_${f.suffix}`,phone:`+779${f.suffix}`,passwordHash:"x",firstName:"Родитель",lastName:f.suffix,roleId:role.id}});
  t.after(async()=>{await f.prisma.user.deleteMany({where:{id:parent.id}})});
  const link=await f.prisma.parentStudentLink.create({data:{parentUserId:parent.id,studentUserId:f.student.id}});
  assert.equal((await getSectorCertificate(parent.id,created.id)).number,issued.number);
  await f.prisma.parentVisibilityPolicy.create({data:{studentId:f.student.id,showPlanProgress:false}});
  await assert.rejects(getSectorCertificate(parent.id,created.id));
  await f.prisma.parentVisibilityPolicy.update({where:{studentId:f.student.id},data:{showPlanProgress:true}});
  await f.prisma.parentStudentLink.update({where:{id:link.id},data:{isActive:false}});
  await assert.rejects(getSectorCertificate(parent.id,created.id));
});

integrationTest("exam result and reward roll back together and a retry finishes exactly once", async t => {
  const f=await createFixture(t);
  await f.markReady();
  const exams=await import("./sector-exam.service.js");
  const created=await exams.createSectorExam(f.teacher.id,{planId:f.planId,items:(await exams.sectorExamTemplate(f.planId)).items,send:true});
  await exams.scheduleSectorExamFromCrm(created.id,{crmClassId:`atomic-${f.suffix}`,lessonAt:new Date()});
  const started=await exams.startSectorExam(f.teacher.id,created.id);
  for(const item of started.items) await exams.markSectorExamItem(f.teacher.id,created.id,item.id,true);
  const conflicting=await f.prisma.pointsTransaction.create({data:{studentId:f.student.id,amount:1,reason:"Conflicting receipt",sourceKey:`learning-plan-completion:${f.planId}:${f.student.id}`}});
  await assert.rejects(exams.finishSectorExam(f.teacher.id,created.id,{decision:"close_sector"}),rejectsWith("POINTS_SOURCE_KEY_CONFLICT"));
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:created.id}})).status,"in_progress");
  const plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  assert.equal(plan.status,"active");
  assert.equal(plan.completionRewardSourceKey,null);
  await f.prisma.pointsTransaction.delete({where:{id:conflicting.id}});
  const results=await Promise.all([
    exams.finishSectorExam(f.teacher.id,created.id,{decision:"close_sector"}),
    exams.finishSectorExam(f.teacher.id,created.id,{decision:"close_sector"}),
  ]);
  assert.equal(results.reduce((sum,row)=>sum+row.awardedPoints,0),250);
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:created.id}})).status,"completed");
  await assert.rejects(exams.markSectorExamItem(f.teacher.id,created.id,started.items[0]!.id,false),rejectsWith("SECTOR_EXAM_NOT_IN_PROGRESS"));
});


integrationTest("lesson submission stages readiness; CRM approval publishes it and keeps personal homework within a group",async t=>{
  const f=await createFixture(t);
  const lessons=await import("./learning-lesson-v2.service.js");
  const crmClassId=`report-sectors-${f.suffix}`;
  const previousFetch=globalThis.fetch;
  t.mock.method(globalThis,"fetch",async(input:string|URL|Request)=>{
    const url=String(input);
    if(url.includes(`/classes/${crmClassId}`)) {
      const data=url.endsWith("/students")?{students:[{crmStudentId:f.crmStudentId,name:"Ученик"},{crmStudentId:"another-student",name:"Другой"}]}:{
        crmClassId,classType:"group",status:"started",date:"2026-11-01",startTime:"14:00",group:{crmGroupId:`group-${f.suffix}`},groupDirection:(await f.prisma.direction.findUniqueOrThrow({where:{crmDirectionId:f.crmDirectionId}})).title,teacher:{crmTeacherId:f.teacher.crmTeacherId},
      };
      return new Response(JSON.stringify({success:true,data}),{status:200,headers:{"Content-Type":"application/json"}});
    }
    return previousFetch(input);
  });
  t.after(async()=>{await f.prisma.offlineLessonProjection.deleteMany({where:{crmClassId}})});
  const input={readySectorIds:[f.planId],studiedPlanIds:[f.planId],homeworkDecisions:[],topicUpdates:[{topicId:f.topicIds[0]!,expectedPercent:0,toPercent:40}],homeworkAssignment:{topicId:f.topicIds[0]!,instructions:"Повторить ритм"}};
  await assert.rejects(lessons.validateLearningLessonV2ResultsForSubmission(f.teacher.id,crmClassId,input,new Set(["another-student"])),rejectsWith("PERSONAL_LEARNING_STUDENT_ABSENT"));
  await lessons.validateLearningLessonV2ResultsForSubmission(f.teacher.id,crmClassId,input,new Set([f.crmStudentId,"another-student"]));
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).examReadyAt,null);
  assert.equal((await f.prisma.learningTopic.findUniqueOrThrow({where:{id:f.topicIds[0]}})).progressPercent,0);
  await assert.rejects(lessons.applyLearningLessonV2Results(f.teacher.id,crmClassId,input),rejectsWith("SECTOR_READINESS_REQUIRES_APPROVAL"));
  const approval={reportVersion:1,createdByUserId:f.teacher.id,recipientCrmStudentIds:[f.crmStudentId,"another-student"]};
  await lessons.applyApprovedLearningLessonV2Results(f.teacher.id,crmClassId,input,approval);
  const plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  assert.equal(plan.examReadyAt?.toISOString(),"2026-11-01T09:00:00.000Z");
  assert.equal(plan.studyStartedAt?.toISOString(),"2026-11-01T09:00:00.000Z");
  assert.equal((await f.prisma.learningTopic.findUniqueOrThrow({where:{id:f.topicIds[0]}})).progressPercent,40);
  let assignment=await f.prisma.learningHomeworkAssignment.findFirstOrThrow({where:{sourceLessonId:crmClassId},include:{recipients:true}});
  assert.deepEqual(assignment.recipients.map(row=>row.crmStudentId),[f.crmStudentId]);
  // A delayed finalization retry after the old sector closed must keep the same recipients.
  await f.prisma.learningPlan.update({where:{id:f.planId},data:{status:"closed"}});
  await lessons.applyApprovedLearningLessonV2Results(f.teacher.id,crmClassId,input,approval);
  assignment=await f.prisma.learningHomeworkAssignment.findFirstOrThrow({where:{sourceLessonId:crmClassId},include:{recipients:true}});
  assert.deepEqual(assignment.recipients.map(row=>row.crmStudentId),[f.crmStudentId]);
  assert.equal(await f.prisma.learningSectorEvent.count({where:{planId:f.planId,kind:"exam_ready"}}),1);
});


integrationTest("an already booked legacy exam keeps its original admission without inventing a readiness date",async t=>{
  const f=await createFixture(t);
  const exams=await import("./sector-exam.service.js");
  await f.allTopicsDone();
  const exam=await exams.createSectorExam(f.teacher.id,{planId:f.planId,items:(await exams.sectorExamTemplate(f.planId)).items,send:true});
  await f.prisma.sectorExam.update({where:{id:exam.id},data:{requiresReadinessConfirmation:false}});
  await exams.scheduleSectorExamFromCrm(exam.id,{crmClassId:`legacy-${f.suffix}`,lessonAt:new Date()});
  assert.equal((await exams.listTeacherStudentSectorExams(f.teacher.id,f.crmStudentId))[0]?.canStart,true);
  assert.equal((await exams.startSectorExam(f.teacher.id,exam.id)).status,"in_progress");
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).examReadyAt,null);
});
