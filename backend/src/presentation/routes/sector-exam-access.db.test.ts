import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const dbtest=process.env.RUN_DB_INTEGRATION_TESTS==="1"?test:test.skip;

dbtest("new exam routes enforce current roles even when a student or parent has an offline permission",async t=>{
  const {default:Fastify}=await import("fastify");
  const {default:jwt}=await import("@fastify/jwt");
  const {prisma}=await import("../../infrastructure/database/prisma.js");
  const {sectorExamRoutes}=await import("./sector-exam.routes.js");
  const {teacherOfflineRoutes}=await import("./teacher-offline.routes.js");
  const {errorHandler}=await import("../middleware/error-handler.js");
  const app=Fastify();
  await app.register(jwt,{secret:"local-sector-route-verification-secret"});
  app.setErrorHandler(errorHandler);
  await app.register(sectorExamRoutes);
  await app.register(teacherOfflineRoutes);
  await app.ready();
  const ids:string[]=[],addedPermissions:string[]=[];
  let directionId:string|null=null;
  t.after(async()=>{
    await app.close();
    if(directionId) {await prisma.sectorExamProgram.deleteMany({where:{directionId}});await prisma.direction.delete({where:{id:directionId}});}
    await prisma.auditLog.deleteMany({where:{actorId:{in:ids}}});
    await prisma.user.deleteMany({where:{id:{in:ids}}});
    await prisma.rolePermission.deleteMany({where:{id:{in:addedPermissions}}});
  });
  async function account(slug:string) {
    const role=await prisma.role.upsert({where:{slug},create:{slug,name:slug},update:{}});
    for(const code of ["offline_school.read","offline_school.write","progress.read","family.read"]) {
      const permission=await prisma.permission.upsert({where:{code},create:{code},update:{}});
      const existing=await prisma.rolePermission.findUnique({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}}});
      if(!existing) addedPermissions.push((await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}})).id);
    }
    const user=await prisma.user.create({data:{login:`sector-access-${randomUUID()}`,phone:randomUUID().slice(0,20),passwordHash:"x",firstName:"Access",lastName:slug,roleId:role.id}});
    ids.push(user.id);
    return {authorization:`Bearer ${app.jwt.sign({sub:user.id,sessionVersion:user.sessionVersion})}`};
  }
  const admin=await account("admin"),teacher=await account("teacher"),student=await account("student"),parent=await account("parent");
  assert.equal((await app.inject({method:"GET",url:"/admin/exam-programs"})).statusCode,401);
  for(const headers of [teacher,student,parent]) assert.equal((await app.inject({method:"GET",url:"/admin/exam-programs",headers})).statusCode,403);
  for(const headers of [teacher,student,parent]) {
    assert.equal((await app.inject({method:"GET",url:"/admin/exam-scheduling-options",headers})).statusCode,403);
    for(const endpoint of ["schedule","participants"]) assert.equal((await app.inject({method:endpoint==="schedule"?"POST":"PUT",url:`/admin/exam-sessions/${randomUUID()}/${endpoint}`,headers,payload:{}})).statusCode,403);
  }
  for(const headers of [student,parent]) assert.equal((await app.inject({method:"GET",url:`/exam-sessions/${randomUUID()}`,headers})).statusCode,403);
  assert.equal((await app.inject({method:"GET",url:"/admin/exam-programs",headers:admin})).statusCode,200);
  for(const request of [
    {method:"GET" as const,url:`/admin/sector-exams/template/${randomUUID()}`},
    {method:"POST" as const,url:"/admin/sector-exams"},
    {method:"POST" as const,url:"/admin/sector-exams/group"},
    {method:"PUT" as const,url:`/admin/sector-exams/${randomUUID()}/items`},
    {method:"POST" as const,url:`/admin/sector-exams/${randomUUID()}/send`},
    {method:"POST" as const,url:`/teachers/me/groups/g/sectors/${randomUUID()}/members/s/pass`},
    {method:"POST" as const,url:`/teachers/me/groups/g/sectors/${randomUUID()}/close`},
  ]) assert.equal((await app.inject({...request,headers:admin})).statusCode,404,`retired route ${request.url}`);

  const direction=await prisma.direction.create({data:{title:"Access test",slug:`sector-access-${randomUUID()}`,crmDirectionId:randomUUID(),crmIsActive:true}});directionId=direction.id;
  const payload={directionId:direction.id,sectorNumber:1,title:"Экзамен",durationMinutes:15,items:[{title:"Песня",criteria:"Ритм"}]};
  assert.equal((await app.inject({method:"POST",url:"/admin/exam-programs",payload,headers:teacher})).statusCode,403);
  const created=await app.inject({method:"POST",url:"/admin/exam-programs",payload,headers:admin});
  assert.equal(created.statusCode,200,created.body);
  for(const headers of [admin,student,parent]) assert.equal((await app.inject({method:"POST",url:`/teachers/me/students/s1/sectors/${randomUUID()}/next`,headers,payload:{crmDirectionId:direction.crmDirectionId,expectedVersion:1}})).statusCode,403);
  assert.equal((await app.inject({method:"GET",url:"/students/me/sector-statistics",headers:student})).statusCode,200);
  assert.equal((await app.inject({method:"GET",url:"/students/me/sector-statistics",headers:parent})).statusCode,403);
  assert.equal((await app.inject({method:"GET",url:`/parents/me/children/${randomUUID()}/sector-statistics`,headers:parent})).statusCode,404);
});
