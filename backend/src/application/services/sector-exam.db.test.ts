import {createExamFixture as createFixture} from "../../../test-support/personal-exam-fixture.js";
import { testExamTasks,prepareTestExam,sendTestExam,bookTestExam } from "../../../test-support/exam-fixtures.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-exam-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";
for(const feature of ["LEARNING_TOPICS","HOMEWORK_FLOW","LESSON_SYNC","UNIFIED_LESSON","REWARD_ECONOMY"]) process.env[`FEATURE_${feature}_V2`] = "true";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("card readiness is authorized, shared with the board, idempotent, and survives reversal of a different report", async t => {
  const f = await createFixture(t);
  const { markStudentSectorReady, listTeacherStudentSectorExams, listAdminSectorExamBoard } = await import("./sector-exam.service.js");
  const { applyApprovedSectorReadiness, reverseSectorReadiness } = await import("./sector-readiness.service.js");
  t.after(async () => { await f.prisma.auditLog.deleteMany({ where: { entityType: "learning_plan", entityId: f.planId } }); });
  const before = await listTeacherStudentSectorExams(f.teacher.id, f.crmStudentId);
  assert.equal(before[0].canMarkReady, true);
  await assert.rejects(markStudentSectorReady(f.stranger.id, f.crmStudentId, f.planId));
  await assert.rejects(markStudentSectorReady(f.teacher.id, "another-student", f.planId));
  const results = await Promise.all([markStudentSectorReady(f.teacher.id, f.crmStudentId, f.planId), markStudentSectorReady(f.teacher.id, f.crmStudentId, f.planId)]);
  assert.equal(results.filter(r => !r.idempotent).length, 1);
  assert.equal(await f.prisma.learningSectorEvent.count({ where: { planId: f.planId, kind: "exam_ready" } }), 1);
  assert.equal(await f.prisma.auditLog.count({ where: { entityId: f.planId, entityType: "learning_plan" } }), 1);
  const cardAt = results[0].readyAt!;
  const board = await listAdminSectorExamBoard();
  assert.equal(board.sectors.find(row => row.planId === f.planId)?.progress.ready, true);
  assert.equal(await f.prisma.pointsTransaction.count({ where: { studentId: f.student.id } }), 0);
  assert.equal(await f.prisma.sectorExam.count({ where: { planId: f.planId } }), 0);
  assert.equal((await listTeacherStudentSectorExams(f.teacher.id, f.crmStudentId))[0].canMarkReady, false);
  const crmClassId = `ready-report-${f.suffix}`;
  await applyApprovedSectorReadiness({ planIds: [f.planId], recipientCrmStudentIds: [f.crmStudentId], actorUserId: f.teacher.id, crmClassId, reportVersion: 1, eventAt: new Date(cardAt.getTime() - 60000) });
  await f.prisma.$transaction(tx => reverseSectorReadiness(tx, crmClassId, 1, f.teacher.id, new Date()));
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } })).examReadyAt?.toISOString(), cardAt.toISOString());
});

integrationTest("card readiness refuses unpublished, closed and unassigned-direction sectors", async t => {
  const f = await createFixture(t);
  const { markStudentSectorReady } = await import("./sector-exam.service.js");
  await f.prisma.learningPlan.update({ where: { id: f.planId }, data: { publishedVersionNumber: null } });
  await assert.rejects(markStudentSectorReady(f.teacher.id, f.crmStudentId, f.planId), (e: any) => e.code === "SECTOR_NOT_PUBLISHED");
  await f.prisma.learningPlan.update({ where: { id: f.planId }, data: { publishedVersionNumber: 1, status: "closed" } });
  await assert.rejects(markStudentSectorReady(f.teacher.id, f.crmStudentId, f.planId), (e: any) => e.code === "SECTOR_ALREADY_CLOSED");
  await f.prisma.learningPlan.update({ where: { id: f.planId }, data: { status: "active" } });
  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  await f.prisma.direction.update({ where: { id: plan.directionId }, data: { crmDirectionId: `unassigned-${f.suffix}` } });
  await assert.rejects(markStudentSectorReady(f.teacher.id, f.crmStudentId, f.planId));
  assert.equal(await f.prisma.learningSectorEvent.count({ where: { planId: f.planId, kind: "exam_ready" } }), 0);
});


const rejectsWith = (code: string) => (error: { code?: string }) => {
  assert.equal(error.code, code);
  return true;
};

integrationTest("the database refuses orphan attempts and material-linked new tasks",async t=>{
  const f=await createFixture(t);
  const exam=await prepareTestExam(f.teacher.id,{planId:f.planId,items:[{title:"Собственное задание",criteria:"Критерий"}]});
  await assert.rejects(f.prisma.sectorExamItem.create({data:{examId:exam.id,kind:"topic",topicId:f.topicIds[0],title:"Автоматическая тема",position:1}}));
  assert.equal(await f.prisma.sectorExamItem.count({where:{examId:exam.id}}),1);
  const plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  await assert.rejects(f.prisma.$executeRaw`INSERT INTO sector_exams(id,plan_id,crm_student_id,direction_id,status,updated_at) VALUES(${randomUUID()}::uuid,${plan.id}::uuid,${f.crmStudentId},${plan.directionId}::uuid,'cancelled',NOW())`,error=>(error as {meta?:{code?:string}}).meta?.code==="23502");
  assert.equal(await f.prisma.sectorExam.count({where:{planId:f.planId}}),1);
});

integrationTest("a cancelled draft preserves history and a replacement still uses the same builder",async t=>{
  const f=await createFixture(t);const p=await import("./sector-exam-program.service.js");
  const first=await prepareTestExam(f.teacher.id,{planId:f.planId,items:[{title:"Задание"}]});
  await p.cancelExamSession(first.sessionId);
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:first.id}})).status,"cancelled");
  const replacement=await prepareTestExam(f.teacher.id,{planId:f.planId,items:[{title:"Задание"}]});
  assert.equal(replacement.attempt,1,"a cancelled draft is not a failed attempt");
  assert.equal(replacement.previousExamId,first.id);
  await f.markReady();await p.sendExamSession(replacement.sessionId);
  await assert.rejects(p.cancelExamSession(replacement.sessionId),rejectsWith("EXAM_SESSION_ALREADY_BOOKED"));
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:replacement.id}})).status,"awaiting_schedule");
});

integrationTest("the exam starts after CRM scheduling and explicit readiness with incomplete topics, then issues a certificate", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");

  const template = await testExamTasks(f.planId);
  assert.deepEqual(template.items.map((item) => [item.kind, item.title, item.criteria]), [
    ["custom", "Am и E", "Смена без пауз"],
    ["custom", "Бой восьмыми", "Две минуты под метроном"],
  ]);
  const exam = await prepareTestExam(f.teacher.id, {
    planId: f.planId,
    items: [...template.items, { kind: "custom", title: "Сыграть песню целиком", criteria: "С вокалом" }],
  });
  assert.equal(exam.status, "draft");
  await assert.rejects(prepareTestExam(f.teacher.id, { planId: f.planId, items: template.items }), rejectsWith("SECTOR_EXAM_ALREADY_OPEN"));
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("FORBIDDEN"));

  await assert.rejects(sendTestExam(exam.id),rejectsWith("EXAM_SESSION_STUDENT_NOT_READY"));
  await f.markReady();
  await sendTestExam(exam.id);
  const pending = await exams.listSectorExamsAwaitingSchedule();
  assert.ok(pending.some((item) => item.examId === exam.id && item.itemsCount === 3), "CRM sees it in the queue");

  const lessonAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await bookTestExam(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt, crmTeacherId: f.teacher.crmTeacherId });
  const told = await f.prisma.userNotification.findFirst({ where: { userId: f.student.id, type: "sector_exam_updated" } });
  assert.ok(told, "the student is told the exam date");
  await f.prisma.learningPlan.update({where:{id:f.planId},data:{examReadyAt:null}});
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("SECTOR_EXAM_NOT_READY"));
  await assert.rejects(exams.startSectorExam(f.stranger.id, exam.id), (error: { statusCode?: number }) => error.statusCode === 403);

  // Topics at 100 % do not close an individual sector on their own any more.
  await (await import("./sector-readiness.service.js")).applyApprovedSectorReadiness({planIds:[f.planId],recipientCrmStudentIds:[f.crmStudentId],crmClassId:`ready-${f.suffix}`,actorUserId:f.teacher.id,reportVersion:2,eventAt:new Date()});
  const still = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, []);
  assert.equal(still[0]?.status, "active");
  assert.equal(still[0]?.exam?.status, "scheduled");
  assert.equal(still[0]?.exam?.scheduledAt?.toISOString(), lessonAt.toISOString());

  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  assert.equal(started.status, "in_progress");
  for (const item of started.items.slice(0, 2)) await exams.markSectorExamItem(f.teacher.id, exam.id, item.id, true);
  await assert.rejects(
    exams.finishSectorExam(f.teacher.id, exam.id, { decision: "pass" }),
    rejectsWith("SECTOR_EXAM_ITEMS_UNMARKED"),
  );
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[2]!.id, true);

  const finished = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "pass" });
  assert.equal(finished.exam.outcome, "passed");
  assert.match(finished.exam.certificate?.number ?? "", /^MS-\d{4}-[0-9A-F]{8}$/);
  assert.equal(finished.awardedPoints, 250);
  const again = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "pass" });
  assert.equal(again.awardedPoints, 0, "repeating the result pays nothing");
  const points = await f.prisma.pointsTransaction.findMany({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } });
  assert.deepEqual(points.map((row) => row.amount), [250]);

  const history = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, [], { includeClosed: true });
  assert.equal(history[0]?.status, "closed");
  assert.deepEqual(history[0]?.exam?.items.map((item) => item.done), [true, true, true]);
  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.closeReason, "exam");
});

integrationTest("a retake keeps the result and returns the pupil to the same session builder", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  await f.markReady();
  const template = await testExamTasks(f.planId);
  const exam = await prepareTestExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await bookTestExam(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt: new Date() });
  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[0]!.id, true);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[1]!.id, false);

  const result = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "retake", comment: "Бой пока неровный" });
  assert.equal(result.exam.outcome, "partial");
  assert.equal(result.exam.certificate, null);
  assert.equal(result.retakeExamId,null,"no separate automatic exam queue");
  assert.equal(await f.prisma.sectorExam.count({where:{planId:f.planId}}),1);
  const retake=await prepareTestExam(f.teacher.id,{planId:f.planId,items:started.items,send:true});
  assert.equal(retake.status,"awaiting_schedule");
  assert.equal(retake.attempt,2);
  assert.equal(retake.previousExamId,exam.id);
  assert.deepEqual(retake.items.map(item=>item.title),started.items.map(item=>item.title));

  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.status, "active");
  assert.equal(await f.prisma.pointsTransaction.count({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } }), 0);

  const teacherView = await exams.listTeacherStudentSectorExams(f.teacher.id, f.crmStudentId);
  assert.equal(teacherView[0]?.exam?.attempt, 2);
  assert.equal(teacherView[0]?.previousExam?.outcome, "partial");
  assert.equal(teacherView[0]?.canStart, false, "the retake waits for CRM to book it");

  // A failed exam cannot close the sector or issue its reward.
  await bookTestExam(retake.id, { crmClassId: `exam-2-${f.suffix}`, lessonAt: new Date() });
  const second = await exams.startSectorExam(f.teacher.id, retake.id);
  for (const item of second.items) await exams.markSectorExamItem(f.teacher.id, retake.id, item.id, false);
  await assert.rejects(exams.finishSectorExam(f.teacher.id, retake.id, { decision: "pass" }), rejectsWith("SECTOR_EXAM_NOT_PASSED"));
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:retake.id}})).status,"in_progress");
  const failed = await exams.finishSectorExam(f.teacher.id, retake.id, { decision: "retake" });
  assert.equal(failed.exam.outcome, "failed");
  assert.equal(failed.exam.certificate, null);
  assert.equal(failed.awardedPoints, 0);
  assert.equal(failed.retakeExamId,null);
});

integrationTest("an early close cancels the exam prepared for the sector", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const template = await testExamTasks(f.planId);
  const exam = await prepareTestExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await f.plans.closeStudentSectorEarlyV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, { points: 0 });
  const cancelled = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await exams.listSectorExamsAwaitingSchedule()).some((item) => item.examId === exam.id), false);
  await assert.rejects(
    prepareTestExam(f.teacher.id, { planId: f.planId, items: template.items }),
    rejectsWith("SECTOR_ALREADY_CLOSED"),
  );
});

integrationTest("a cancelled exam lesson in CRM puts the exam back in the queue; a moved one moves its date", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const template = await testExamTasks(f.planId);
  const exam = await prepareTestExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await bookTestExam(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt: new Date("2099-01-10T07:00:00.000Z") });

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
  const template = await testExamTasks(f.planId);
  const exam = await prepareTestExam(f.teacher.id,{planId:f.planId,items:template.items,send:true});
  await bookTestExam(exam.id,{crmClassId:`after-next-${f.suffix}`,lessonAt:new Date()});
  const started = await exams.startSectorExam(f.teacher.id,exam.id);
  for (const item of started.items) await exams.markSectorExamItem(f.teacher.id,exam.id,item.id,true);
  const finished = await exams.finishSectorExam(f.teacher.id,exam.id,{decision:"pass"});
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

integrationTest("a draft may include an unready student, but assigning it requires readiness and stale programs still fail", async t => {
  const f=await createFixture(t);
  const {saveExamProgram,createExamSession,sendExamSession}=await import("./sector-exam-program.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  const data={directionId,sectorNumber:1,title:"Проверка",durationMinutes:15,items:[{title:"Ритм",criteria:"Счёт"}]};
  const program=await saveExamProgram(f.teacher.id,data);
  const request={programId:program.id,programRevision:1,title:"Проверка",planIds:[f.planId],requestKey:randomUUID()};
  const draftSession=await createExamSession(f.teacher.id,request);
  assert.equal(draftSession.exams[0]?.status,"draft");
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).examReadyAt,null);
  await assert.rejects(sendExamSession(draftSession.id),rejectsWith("EXAM_SESSION_STUDENT_NOT_READY"));
  await f.markReady();
  await saveExamProgram(f.teacher.id,{...data,title:"Обновлённая"},program.id,1);
  await assert.rejects(createExamSession(f.teacher.id,{...request,requestKey:randomUUID()}),rejectsWith("EXAM_PROGRAM_STALE"));
  assert.equal(await f.prisma.sectorExam.count({where:{planId:f.planId}}),1);
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
  const created=await prepareTestExam(f.teacher.id,{planId:f.planId,items:(await testExamTasks(f.planId)).items,send:true});
  await bookTestExam(created.id,{crmClassId:`cert-${f.suffix}`,lessonAt:new Date()});
  const started=await exams.startSectorExam(f.teacher.id,created.id);
  for(const item of started.items) await exams.markSectorExamItem(f.teacher.id,created.id,item.id,true);
  await exams.finishSectorExam(f.teacher.id,created.id,{decision:"pass"});
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
  const created=await prepareTestExam(f.teacher.id,{planId:f.planId,items:(await testExamTasks(f.planId)).items,send:true});
  await bookTestExam(created.id,{crmClassId:`atomic-${f.suffix}`,lessonAt:new Date()});
  const started=await exams.startSectorExam(f.teacher.id,created.id);
  for(const item of started.items) await exams.markSectorExamItem(f.teacher.id,created.id,item.id,true);
  const conflicting=await f.prisma.pointsTransaction.create({data:{studentId:f.student.id,amount:1,reason:"Conflicting receipt",sourceKey:`learning-plan-completion:${f.planId}:${f.student.id}`}});
  await assert.rejects(exams.finishSectorExam(f.teacher.id,created.id,{decision:"pass"}),rejectsWith("POINTS_SOURCE_KEY_CONFLICT"));
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:created.id}})).status,"in_progress");
  const plan=await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}});
  assert.equal(plan.status,"active");
  assert.equal(plan.completionRewardSourceKey,null);
  await f.prisma.pointsTransaction.delete({where:{id:conflicting.id}});
  const results=await Promise.all([
    exams.finishSectorExam(f.teacher.id,created.id,{decision:"pass"}),
    exams.finishSectorExam(f.teacher.id,created.id,{decision:"pass"}),
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


integrationTest("neither topic completion nor a legacy readiness flag bypasses admission",async t=>{
  const f=await createFixture(t);const exams=await import("./sector-exam.service.js");
  const exam=await prepareTestExam(f.teacher.id,{planId:f.planId,items:(await testExamTasks(f.planId)).items,send:true});
  await bookTestExam(exam.id,{crmClassId:`uniform-${f.suffix}`,lessonAt:new Date()});
  await f.allTopicsDone();
  await f.prisma.learningPlan.update({where:{id:f.planId},data:{examReadyAt:null}});
  await f.prisma.sectorExam.update({where:{id:exam.id},data:{requiresReadinessConfirmation:false}});
  await assert.rejects(exams.startSectorExam(f.teacher.id,exam.id),rejectsWith("SECTOR_EXAM_NOT_READY"));
});


integrationTest("one six-pupil exam uses its own checklist, an appointed examiner, individual results and certificates",async t=>{
  const f=await createFixture(t);
  const participants=[{student:f.student,crmStudentId:f.crmStudentId,planId:f.planId}];
  for(let i=0;i<5;i++)participants.push(await f.addStudent());
  const programs=await import("./sector-exam-program.service.js");
  const exams=await import("./sector-exam.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  const input={directionId,sectorNumber:1,title:"Переход в квартеты",durationMinutes:15,items:[{title:"Сыграть свою партию с ансамблем",criteria:"Продолжить после ошибки"},{title:"Вступить после отсчёта",criteria:"Общий старт"}]};
  const program=await programs.saveExamProgram(f.teacher.id,input);
  const session=await programs.createExamSession(f.teacher.id,{programId:program.id,programRevision:1,title:input.title,planIds:participants.map(p=>p.planId),requestKey:randomUUID()});
  assert.equal(session.exams.length,6);
  await assert.rejects(programs.sendExamSession(session.id),rejectsWith("EXAM_SESSION_STUDENT_NOT_READY"));
  const {applyApprovedSectorReadiness}=await import("./sector-readiness.service.js");
  await applyApprovedSectorReadiness({planIds:participants.map(p=>p.planId),recipientCrmStudentIds:participants.map(p=>p.crmStudentId),crmClassId:`ready-six-${f.suffix}`,reportVersion:1,actorUserId:f.teacher.id,eventAt:new Date()});
  const previousFetch=globalThis.fetch;
  let bookingCalls=0;
  t.mock.method(globalThis,"fetch",async(input:string|URL|Request,init?:RequestInit)=>{
    if(!String(input).endsWith("/sector-exams/book")) return previousFetch(input,init);
    bookingCalls++;
    const payload=JSON.parse(String(init?.body));
    assert.deepEqual([...payload.examIds].sort(),session.exams.map(e=>e.id).sort());
    assert.equal(payload.actorAppUserId,f.teacher.id);
    assert.equal((init?.headers as Record<string,string>)["X-Integration-System"],"learning-platform");
    return Response.json({success:true,data:{class:{id:`common-${f.suffix}`,date:"2099-01-01T00:00:00.000Z",startTime:"11:00",endTime:"12:00",teacherId:f.stranger.crmTeacherId,roomId:"room"},alreadyBooked:bookingCalls>1,platformConfirmed:false}});
  });
  const slot={date:"2099-01-01",startTime:"11:00",endTime:"12:00",teacherId:f.stranger.crmTeacherId!,roomId:"room"};
  const booked=await programs.scheduleExamSession(f.teacher.id,session.id,slot);
  assert.equal(booked.scheduledAt.toISOString(),"2099-01-01T06:00:00.000Z");
  const noticesBefore=await f.prisma.userNotification.count({where:{userId:{in:participants.map(p=>p.student.id)}}});
  assert.equal((await programs.scheduleExamSession(f.teacher.id,session.id,slot)).alreadyBooked,true);
  assert.equal(await f.prisma.userNotification.count({where:{userId:{in:participants.map(p=>p.student.id)}}}),noticesBefore,"retry does not duplicate pupil invitations");
  assert.equal((await exams.listTeacherStudentSectorExams(f.teacher.id,f.crmStudentId))[0]?.canStart,false);
  const view=await exams.getExamSessionWorkspace(f.stranger.id,session.id);
  assert.equal(view.participants.length,6);
  assert.ok(view.participants.every(p=>p.canStart));
  await assert.rejects(exams.getExamSessionWorkspace(f.teacher.id,session.id),error=>(error as {statusCode:number}).statusCode===403);
  for(const person of view.participants){
    assert.deepEqual(person.exam.items.map(item=>item.title),input.items.map(item=>item.title));
    const own=participants.find(p=>p.crmStudentId===person.exam.crmStudentId)!;
    const shown=await exams.getPersonalExam(own.student.id,person.exam.id);
    assert.equal(shown.exam.sessionTitle,input.title);
    assert.equal(shown.exam.items.length,2);
    const foreign=participants.find(p=>p.student.id!==own.student.id)!;
    await assert.rejects(exams.getPersonalExam(foreign.student.id,person.exam.id),error=>(error as {statusCode:number}).statusCode===404);
    const started=await exams.startSectorExam(f.stranger.id,person.exam.id);
    for(const item of started.items) await exams.markSectorExamItem(f.stranger.id,started.id,item.id,true);
    const finished=await exams.finishSectorExam(f.stranger.id,started.id,{decision:"pass"});
    assert.equal(finished.exam.outcome,"passed"); assert.ok(finished.exam.certificate); assert.equal(finished.awardedPoints,250);
    assert.equal((await exams.finishSectorExam(f.stranger.id,started.id,{decision:"pass"})).awardedPoints,0);
    const {getSectorCertificate}=await import("./sector-certificate.service.js");
    assert.equal((await getSectorCertificate(f.stranger.id,started.id)).programTitle,input.title);
  }
  assert.equal((await f.prisma.learningTopic.findMany({where:{directionId},select:{progressPercent:true}})).every(topic=>topic.progressPercent===0),true,"exam marks do not overwrite sector material mastery");
  assert.equal((await exams.getExamSessionWorkspace(f.stranger.id,session.id)).participants.filter(p=>p.exam.status==="completed").length,6);
});

integrationTest("a saved draft roster may add and remove pupils without changing its saved tasks or allowing stale edits",async t=>{
  const f=await createFixture(t); const second=await f.addStudent();
  const programs=await import("./sector-exam-program.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  const input={directionId,sectorNumber:1,title:"Состав",durationMinutes:15,items:[{title:"Старая программа",criteria:"Критерий"}]};
  const program=await programs.saveExamProgram(f.teacher.id,input);
  const session=await programs.createExamSession(f.teacher.id,{programId:program.id,programRevision:1,title:input.title,planIds:[f.planId],requestKey:randomUUID()});
  await programs.saveExamProgram(f.teacher.id,{...input,items:[{title:"Новая программа",criteria:"Другой"}]},program.id,1);
  const changed=await programs.updateExamSessionParticipants(f.teacher.id,session.id,{planIds:[f.planId,second.planId],expectedExamIds:session.exams.map(e=>e.id)});
  assert.equal(changed.exams.length,2);
  const added=await f.prisma.sectorExam.findUniqueOrThrow({where:{id:changed.exams.find(e=>e.planId===second.planId)!.id},include:{items:true}});
  assert.equal(added.items[0]?.title,"Старая программа");
  await assert.rejects(programs.updateExamSessionParticipants(f.teacher.id,session.id,{planIds:[second.planId],expectedExamIds:session.exams.map(e=>e.id)}),rejectsWith("EXAM_SESSION_ROSTER_STALE"));
  const removed=await programs.updateExamSessionParticipants(f.teacher.id,session.id,{planIds:[second.planId],expectedExamIds:changed.exams.map(e=>e.id)});
  assert.equal(removed.exams.length,1);
  assert.equal((await f.prisma.sectorExam.findUniqueOrThrow({where:{id:session.exams[0]!.id}})).status,"cancelled");
});
