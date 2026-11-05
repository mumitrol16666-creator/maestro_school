import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createExamFixture} from "../../../test-support/personal-exam-fixture.js";
const dbtest=process.env.RUN_DB_INTEGRATION_TESTS==="1"?test:test.skip;
process.env.INTEGRATION_SERVICE_SECRET??="group-unified-exam-test-secret";
process.env.CRM_API_URL??="http://127.0.0.1:9";
for(const feature of ["LEARNING_TOPICS","HOMEWORK_FLOW","LESSON_SYNC","UNIFIED_LESSON","REWARD_ECONOMY"])process.env[`FEATURE_${feature}_V2`]="true";

dbtest("quartet pupils use individual readiness, the same session and individual pass/retake outcomes",async t=>{
  const f=await createExamFixture(t,true);const other=await f.addStudent();
  const p=await import("./sector-exam-program.service.js");const e=await import("./sector-exam.service.js");
  const directionId=(await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).directionId;
  // A shared group's material cannot supply an exam result or readiness for its members.
  const shared=await f.prisma.learningPlan.create({data:{directionId,crmGroupId:`quartet-${f.suffix}`,month:"2026-11",sequence:1,isSharedGroupPlan:true,publishedVersionNumber:1}});
  const program=await p.saveExamProgram(f.teacher.id,{directionId,sectorNumber:1,title:"Игра в квартете",durationMinutes:15,items:[{title:"Держать свою партию",criteria:"Общий темп"}]});
  await assert.rejects(p.createExamSession(f.teacher.id,{programId:program.id,programRevision:1,title:program.title,planIds:[shared.id],requestKey:randomUUID()}),error=>(error as {code:string}).code==="EXAM_PERSONAL_SECTOR_REQUIRED");
  const session=await p.createExamSession(f.teacher.id,{programId:program.id,programRevision:1,title:program.title,planIds:[f.planId,other.planId],requestKey:randomUUID()});
  await f.allTopicsDone();
  await assert.rejects(p.sendExamSession(session.id),error=>(error as {code:string}).code==="EXAM_SESSION_STUDENT_NOT_READY");
  const {applyApprovedSectorReadiness}=await import("./sector-readiness.service.js");
  await applyApprovedSectorReadiness({planIds:[f.planId,other.planId],recipientCrmStudentIds:[f.crmStudentId,other.crmStudentId],actorUserId:f.teacher.id,crmClassId:`ready-quartet-${f.suffix}`,reportVersion:1,eventAt:new Date()});
  await p.sendExamSession(session.id);
  for(const exam of session.exams){
    await e.scheduleSectorExamFromCrm(exam.id,{crmClassId:`quartet-exam-${f.suffix}`,lessonAt:new Date(),crmTeacherId:f.stranger.crmTeacherId});
    const started=await e.startSectorExam(f.stranger.id,exam.id);
    const passed=exam.crmStudentId===f.crmStudentId;
    await e.markSectorExamItem(f.stranger.id,exam.id,started.items[0]!.id,passed);
    const result=await e.finishSectorExam(f.stranger.id,exam.id,{decision:passed?"pass":"retake"});
    assert.equal(result.awardedPoints,passed?250:0);assert.equal(Boolean(result.exam.certificate),passed);
  }
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:f.planId}})).status,"closed");
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:other.planId}})).status,"active");
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({where:{id:shared.id}})).status,"active","the group's teaching plan remains independent");
  assert.equal(await f.prisma.sectorMemberPass.count({where:{planId:shared.id}}),0,"there is no separate group pass writer");
  const repeat=await p.createExamSession(f.teacher.id,{programId:program.id,programRevision:1,title:"Повторный экзамен",planIds:[other.planId],requestKey:randomUUID()});
  assert.equal(repeat.exams[0]!.attempt,2);assert.ok(repeat.exams[0]!.previousExamId);
  await p.sendExamSession(repeat.id);
  assert.equal((await e.listSectorExamsAwaitingSchedule()).filter(exam=>exam.sessionId===repeat.id).length,1);
});
