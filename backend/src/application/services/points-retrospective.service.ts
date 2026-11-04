import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {prisma} from "../../infrastructure/database/prisma.js";
import {ConflictError} from "../../domain/errors.js";
import {TOPIC_COMPLETION_POINTS} from "../../domain/product-economy-v2.js";
export const retrospectivePointsInput=z.object({studentId:z.string().uuid(),crmStudentId:z.string().min(1),epochId:z.string().uuid(),topicIds:z.array(z.string().uuid()).min(1).max(50)}).refine(input=>new Set(input.topicIds).size===input.topicIds.length,"Темы повторяются");
type Input=z.infer<typeof retrospectivePointsInput>;
function blocked(message:string):never {throw new ConflictError(message,"RETROSPECTIVE_POINTS_REVIEW_REQUIRED")}
async function inspect(tx:Prisma.TransactionClient,raw:Input) {
  const input=retrospectivePointsInput.parse(raw);
  const student=await tx.user.findFirst({where:{id:input.studentId,crmStudentId:input.crmStudentId,isActive:true,deletedAt:null,role:{slug:"student"}}});
  const epoch=await tx.economicEpoch.findUnique({where:{id:input.epochId}});
  if(!student || !epoch || epoch.status!=="active") blocked("Кабинет или экономическая эпоха изменились");
  if(!await tx.economicEpochParticipant.findUnique({where:{epochId_studentId:{epochId:epoch.id,studentId:student.id}}})) blocked("Нет участия в текущей экономической эпохе");
  const rows=[];
  for(const topicId of [...input.topicIds].sort()) {
    const topic=await tx.learningTopic.findUnique({where:{id:topicId}});
    if(!topic || topic.crmStudentId!==input.crmStudentId || topic.crmGroupId || topic.progressPercent!==100 || !topic.masteredAt || topic.masteredAt>=student.createdAt || topic.masteredAt<epoch.startsAt) blocked("Не подтверждено личное освоение темы до создания кабинета");
    const event=await tx.learningTopicProgress.findFirst({where:{topicId,toPercent:100,source:"lesson",occurredAt:topic.masteredAt},orderBy:{createdAt:"desc"}});
    const crmClassId=event?.sourceKey.match(/^offline-lesson:(.*):topic:[^:]+$/)?.[1];
    if(!event || !crmClassId || event.sourceKey!==`offline-lesson:${crmClassId}:topic:${topicId}`) blocked("Нет события освоения из урока");
    const report=await tx.offlineLessonReport.findUnique({where:{crmClassId},include:{versions:true}});
    const version=report?.versions.find(row=>row.version===report.confirmedVersion);
    const payload=version?.payload as {learningResultsV2?:{topicUpdates?:Array<{topicId:string;toPercent:number}>}}|undefined;
    const attendance=version?.attendancePayload as Array<{crmStudentId:string;attendanceStatus:string}>|undefined;
    if(report?.status!=="confirmed" || !payload?.learningResultsV2?.topicUpdates?.some(row=>row.topicId===topicId && row.toPercent===100) || !Array.isArray(attendance) || !attendance.some(row=>row.crmStudentId===input.crmStudentId && ["present","late"].includes(row.attendanceStatus))) blocked("Урок не подтверждён или в его сохранённом отчёте нет освоения и посещения");
    const sourceKey=`learning-topic-mastery:${topicId}:${student.id}`;
    const reason=`Освоена тема «${topic.title}»`;
    const receipt=await tx.pointsTransaction.findUnique({where:{sourceKey}});
    if(receipt && (receipt.studentId!==student.id || receipt.amount!==TOPIC_COMPLETION_POINTS || receipt.economicEpochId!==epoch.id || receipt.reason!==reason)) blocked("Есть другое начисление по ключу темы");
    if(!receipt && await tx.pointsTransaction.count({where:{sourceKey:{startsWith:`learning-topic-mastery:${topicId}:`},amount:{gt:0}}})) blocked("За тему уже платили другому кабинету. Нужен перенос, а не новое начисление");
    rows.push({topicId,sourceKey,reason,amount:TOPIC_COMPLETION_POINTS,eventAt:event.occurredAt,applied:Boolean(receipt),evidence:{eventId:event.id,reportVersionId:version!.id,confirmedVersion:report!.confirmedVersion}});
  }
  const fingerprint=createHash("sha256").update(JSON.stringify({studentId:student.id,crmStudentId:student.crmStudentId,createdAt:student.createdAt,epochId:epoch.id,rows:rows.map(({applied,...row})=>row)})).digest("hex");
  return {input,rows,fingerprint,pending:rows.filter(row=>!row.applied).reduce((sum,row)=>sum+row.amount,0)};
}
export async function previewRetrospectiveTopicPoints(input:Input) {return prisma.$transaction(async tx=>{const plan=await inspect(tx,input);return {fingerprint:plan.fingerprint,pending:plan.pending,rows:plan.rows}}, {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})}
export async function applyRetrospectiveTopicPoints(input:Input,fingerprint:string,actorId:string) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM users WHERE id=${input.studentId}::uuid FOR UPDATE`;
    if(!await tx.user.findFirst({where:{id:actorId,isActive:true,deletedAt:null,role:{slug:{in:["admin","owner","super_admin"]}}}})) blocked("Требуется действующий администратор");
    const plan=await inspect(tx,input);
    if(plan.fingerprint!==fingerprint) blocked("План восстановления изменился");
    for(const row of plan.rows.filter(row=>!row.applied)) await tx.pointsTransaction.create({data:{studentId:input.studentId,economicEpochId:input.epochId,amount:row.amount,reason:row.reason,sourceKey:row.sourceKey,createdAt:row.eventAt}});
    if(plan.pending) await tx.auditLog.create({data:{entityType:"retrospective_topic_points",entityId:input.studentId,action:"update",actorId,payload:{fingerprint,amount:plan.pending,rows:plan.rows.map(row=>({...row,eventAt:row.eventAt.toISOString()})),authorization:"Восстановление подтверждённых наград до регистрации согласовано владельцем школы 05.11.2026"}}});
    return {awarded:plan.pending,alreadyApplied:plan.pending===0,fingerprint};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
