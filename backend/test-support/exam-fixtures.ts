// Helpers for integration fixtures: every attempt uses the public session builder.
import { randomUUID } from "node:crypto";

export async function testExamTasks(planId:string){
  return {planId,items:[{kind:"custom" as const,title:"Am и E",criteria:"Смена без пауз"},{kind:"custom" as const,title:"Бой восьмыми",criteria:"Две минуты под метроном"}]};
}
export async function prepareTestExam(actorId:string,input:{planId:string;items:Array<{title:string;criteria?:string|null}>;send?:boolean}){
  const {prisma}=await import("../src/infrastructure/database/prisma.js");
  const {saveExamProgram,createExamSession,sendExamSession}=await import("../src/application/services/sector-exam-program.service.js");
  const {applyApprovedSectorReadiness}=await import("../src/application/services/sector-readiness.service.js");
  const plan=await prisma.learningPlan.findUniqueOrThrow({where:{id:input.planId},include:{templateStep:true}});
  const program=await saveExamProgram(actorId,{directionId:plan.directionId,sectorNumber:plan.templateStep?.number??plan.sequence,title:"Тестовый экзамен",durationMinutes:15,items:input.items.map(item=>({title:item.title,criteria:item.criteria??""}))});
  const session=await createExamSession(actorId,{programId:program.id,programRevision:program.revision,title:program.title,planIds:[plan.id],requestKey:randomUUID()});
  if(input.send){
    // Explicit fixture precondition for already scheduled/result/accounting tests.
    await applyApprovedSectorReadiness({planIds:[plan.id],recipientCrmStudentIds:[plan.crmStudentId!],actorUserId:actorId,crmClassId:`fixture-readiness-${session.id}`,reportVersion:1,eventAt:new Date()});
    await sendExamSession(session.id);
  }
  return prisma.sectorExam.findUniqueOrThrow({where:{id:session.exams[0]!.id},include:{items:{orderBy:{position:"asc"}}}});
}
export async function sendTestExam(examId:string){
  const {prisma}=await import("../src/infrastructure/database/prisma.js");
  const {sendExamSession}=await import("../src/application/services/sector-exam-program.service.js");
  const exam=await prisma.sectorExam.findUniqueOrThrow({where:{id:examId}});
  return sendExamSession(exam.sessionId);
}
export async function bookTestExam(examId:string,input:{crmClassId:string;lessonAt:Date;crmTeacherId?:string|null}){
  const {prisma}=await import("../src/infrastructure/database/prisma.js");
  const {scheduleSectorExamFromCrm}=await import("../src/application/services/sector-exam.service.js");
  const exam=await prisma.sectorExam.findUniqueOrThrow({where:{id:examId}});
  const author=await prisma.user.findUniqueOrThrow({where:{id:exam.createdById!}});
  return scheduleSectorExamFromCrm(examId,{...input,crmTeacherId:input.crmTeacherId??author.crmTeacherId});
}
