import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../infrastructure/database/prisma.js";
import { ConflictError } from "../../domain/errors.js";

export const pointsRecoveryInput = z.object({
  oldStudentId:z.string().uuid(), studentId:z.string().uuid(), crmStudentId:z.string().min(1),
  epochId:z.string().uuid(), topicIds:z.array(z.string().uuid()).min(1).max(50),
}).refine(input=>input.oldStudentId!==input.studentId && new Set(input.topicIds).size===input.topicIds.length,"Укажите разные кабинеты и неповторяющиеся темы");
export type PointsRecoveryInput = z.infer<typeof pointsRecoveryInput>;
function conflict(message:string):never {throw new ConflictError(message,"POINTS_RECOVERY_REVIEW_REQUIRED");}
const name=(value:string)=>value.normalize("NFKC").trim().toLocaleLowerCase("ru");

async function inspect(tx:Prisma.TransactionClient,raw:PointsRecoveryInput) {
  const input=pointsRecoveryInput.parse(raw);
  const [old,current,epoch,participants]=await Promise.all([
    tx.user.findUnique({where:{id:input.oldStudentId},include:{role:true}}),
    tx.user.findUnique({where:{id:input.studentId},include:{role:true}}),
    tx.economicEpoch.findUnique({where:{id:input.epochId}}),
    tx.economicEpochParticipant.findMany({where:{epochId:input.epochId,studentId:{in:[input.oldStudentId,input.studentId]}}}),
  ]);
  if(!old?.deletedAt || old.role.slug!=="student" || !current?.isActive || current.deletedAt || current.role.slug!=="student" || current.crmStudentId!==input.crmStudentId) conflict("Связь прежнего и действующего кабинетов изменилась");
  if(name(old.firstName)!==name(current.firstName) || name(old.lastName)!==name(current.lastName)) conflict("Имена кабинетов не совпадают: нужна отдельная проверка личности");
  if(!epoch || epoch.status!=="active" || participants.length!==2) conflict("Проверьте действующую экономическую эпоху и участие обоих кабинетов");
  const rows=[];
  for(const topicId of [...input.topicIds].sort()) {
    const sourceKey=`learning-topic-mastery:${topicId}:${input.oldStudentId}`;
    const archiveKey=`${sourceKey}:reversed:account-recovery`;
    const targetKey=`learning-topic-mastery:${topicId}:${input.studentId}`;
    const debitKey=`account-recovery:${topicId}:${input.oldStudentId}:${input.studentId}`;
    const [original,archived,target,debit]=await Promise.all([
      tx.pointsTransaction.findUnique({where:{sourceKey}}),
      tx.pointsTransaction.findUnique({where:{sourceKey:archiveKey}}),
      tx.pointsTransaction.findUnique({where:{sourceKey:targetKey}}),
      tx.pointsTransaction.findUnique({where:{sourceKey:debitKey}}),
    ]);
    if(original && archived) conflict("Исходное начисление возникло повторно после переноса");
    const source=original??archived;
    if(archived && (!target || !debit)) conflict("Архивная запись переноса не имеет полного подтверждения");
    if(!source || source.studentId!==input.oldStudentId || source.amount!==100 || source.economicEpochId!==input.epochId) conflict(`Не подтверждено исходное начисление темы ${topicId}`);
    const debitReason=`Перенос баллов в действующий кабинет: ${source.id}`;
    if(Boolean(target)!==Boolean(debit)) conflict("Найден неполный или посторонний перенос. Нужна ручная сверка");
    if(target && (target.studentId!==input.studentId || target.amount!==source.amount || target.reason!==source.reason || target.economicEpochId!==input.epochId || target.createdAt.getTime()!==source.createdAt.getTime())) conflict("В новом кабинете уже есть другое начисление за эту тему");
    if(debit && (debit.studentId!==input.oldStudentId || debit.amount!==-source.amount || debit.reason!==debitReason || debit.economicEpochId!==input.epochId)) conflict("Обратная запись переноса не соответствует исходному начислению");
    rows.push({source,sourceKey,archiveKey,targetKey,debitKey,debitReason,applied:Boolean(target)});
  }
  const total=rows.reduce((sum,row)=>sum+row.source.amount,0);
  const pending=rows.filter(row=>!row.applied).reduce((sum,row)=>sum+row.source.amount,0);
  const balance=await tx.pointsTransaction.aggregate({where:{studentId:input.oldStudentId,economicEpochId:input.epochId},_sum:{amount:true}});
  if((balance._sum.amount??0)+(participants.find(row=>row.studentId===input.oldStudentId)?.openingPoints??0)<pending) conflict("Остаток прежнего кабинета меньше суммы переноса");
  // Only immutable awards and reviewed identity are fingerprinted. New legitimate awards do
  // not invalidate this transfer, and its exact replay has the same fingerprint.
  const fingerprint=createHash("sha256").update(JSON.stringify({
    ...input,topicIds:[...input.topicIds].sort(),epochCode:epoch.code,
    identity:[old,current].map(user=>({id:user.id,firstName:user.firstName,lastName:user.lastName,crmStudentId:user.crmStudentId,deletedAt:user.deletedAt})),
    sources:rows.map(row=>({...row.source,sourceKey:row.sourceKey})),
  })).digest("hex");
  return {input,rows,total,pending,fingerprint};
}

/** Read-only preview by default. No account, balance or epoch rows are created here. */
export async function previewPointsAccountRecovery(input:PointsRecoveryInput) {
  return prisma.$transaction(async tx=>{
    const plan=await inspect(tx,input);
    return {fingerprint:plan.fingerprint,total:plan.total,pending:plan.pending,oldStudentId:input.oldStudentId,studentId:input.studentId,rows:plan.rows.map(row=>({sourceId:row.source.id,sourceKey:row.source.sourceKey,targetKey:row.targetKey,amount:row.source.amount,applied:row.applied}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}

/** Deliberate operator action with the fingerprint of a reviewed preview. No web endpoint. */
export async function applyPointsAccountRecovery(input:PointsRecoveryInput,expectedFingerprint:string,actorId:string) {
  return prisma.$transaction(async tx=>{
    for(const id of [input.oldStudentId,input.studentId].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
    const actor=await tx.user.findFirst({where:{id:actorId,isActive:true,deletedAt:null,role:{slug:{in:["admin","owner","super_admin"]}}}});
    if(!actor) conflict("Оператор восстановления должен быть действующим администратором");
    const plan=await inspect(tx,input);
    if(plan.fingerprint!==expectedFingerprint) conflict("План изменился после проверки. Сначала подготовьте новый просмотр");
    // Existing reversal code already skips :reversed: keys. Preserve the original amount,
    // date and receipt ID while moving the effective canonical key to the current account.
    for(const row of plan.rows) {
      if(row.source.sourceKey!==row.archiveKey) await tx.pointsTransaction.update({where:{id:row.source.id},data:{sourceKey:row.archiveKey}});
      if(row.applied) continue;
      await tx.pointsTransaction.create({data:{studentId:input.studentId,economicEpochId:input.epochId,amount:row.source.amount,reason:row.source.reason,sourceKey:row.targetKey,createdAt:row.source.createdAt}});
      await tx.pointsTransaction.create({data:{studentId:input.oldStudentId,economicEpochId:input.epochId,amount:-row.source.amount,reason:row.debitReason,sourceKey:row.debitKey,awardedBy:actorId}});
    }
    if(plan.pending) await tx.auditLog.create({data:{entityType:"points_account_recovery",entityId:input.studentId,action:"update",actorId,payload:{fingerprint:plan.fingerprint,amount:plan.pending,oldStudentId:input.oldStudentId,sources:plan.rows.map(row=>({id:row.source.id,originalKey:row.sourceKey,archivedKey:row.archiveKey,targetKey:row.targetKey})),crmStudentId:input.crmStudentId}}});
    return {transferred:plan.pending,alreadyApplied:plan.pending===0,fingerprint:plan.fingerprint};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15_000});
}
