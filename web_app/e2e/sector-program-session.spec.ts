import {test,expect} from "@playwright/test";
const direction={id:"11111111-1111-4111-8111-111111111111",title:"Гитара",crmDirectionId:"crm-guitar"};
const program={id:"33333333-3333-4333-8333-333333333333",directionId:direction.id,sectorNumber:1,title:"Первый сектор",durationMinutes:15,revision:2,items:[{title:"Сыграть песню",criteria:"Ровный темп"}],direction};
const planId="22222222-2222-4222-8222-222222222222";

test("an admin selects a ready student with incomplete topics and deliberately sends the prepared exam to CRM",async({page,context})=>{
  const user={id:"qa-admin",role:"admin",firstName:"Администратор",permissions:["offline_school.read","offline_school.write"]};
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  let sessions:Array<Record<string,unknown>>=[];
  let submitted:Record<string,unknown>|null=null;
  let sent=0;
  await page.route("**/api/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/,"");
    let data:unknown=[];
    if(path==="/auth/me") data=user;
    else if(path==="/admin/sector-exams") data={sectors:[{planId,sequence:2,curriculumNumber:1,crmStudentId:"s1",studentName:"Ученица Примерова",direction,goal:"Ритм",progress:{completed:2,total:5,percent:40,ready:true},exam:null}],groupSectors:[]};
    else if(path==="/admin/exam-programs") data=[program];
    else if(path==="/admin/exam-program-directions") data=[direction];
    else if(path==="/admin/exam-sessions") {
      if(route.request().method()==="POST") {
        submitted=route.request().postDataJSON();
        sessions=[{id:"session-1",title:"Ноябрьский экзамен",exams:[{id:"exam-1",studentNameSnapshot:"Ученица Примерова",crmStudentId:"s1",status:"draft",scheduledAt:null}]}];
        data=sessions[0];
      } else data=sessions;
    } else if(path==="/admin/exam-sessions/session-1/send") {
      sent++;
      sessions=[{...sessions[0],exams:[{id:"exam-1",studentNameSnapshot:"Ученица Примерова",crmStudentId:"s1",status:"awaiting_schedule",scheduledAt:null}]}];data=sessions[0];
    }
    return route.fulfill({json:{data}});
  });
  await page.goto("/admin/sector-exams");
  await page.getByRole("combobox",{name:"Программа",exact:true}).selectOption(program.id);
  await page.getByRole("checkbox",{name:"Ученица Примерова · сектор 1 · 40%"}).check();
  await page.getByRole("textbox",{name:"Название проведения"}).fill("Ноябрьский экзамен");
  await page.getByRole("button",{name:"Подготовить экзамен · 1 участников"}).click();
  await expect(page.getByText("Ноябрьский экзамен · 1 участников",{exact:true})).toBeVisible();
  expect(submitted).toMatchObject({programId:program.id,programRevision:2,planIds:[planId],title:"Ноябрьский экзамен"});
  expect(sent,"preparing does not book or send the exam automatically").toBe(0);
  await page.getByRole("button",{name:"Отправить на назначение в CRM"}).click();
  await expect(page.getByRole("status")).toContainText("отправлен в CRM");
  expect(sent).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

for(const role of ["admin","student","parent"]) test(`the ${role} can open the same issued certificate without a role redirect`,async({page,context})=>{
  const user={id:`qa-${role}`,role,firstName:"Проверка",permissions:["offline_school.read","progress.read","family.read"]};
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  await page.route("**/api/v1/**",route=>route.fulfill({json:{data:route.request().url().endsWith("/auth/me")?user:route.request().url().includes("/sector-certificates/")?{id:"exam-1",number:"MS-2026-00000001",studentName:"Ученица Примерова",direction:"Гитара",sectorNumber:1,programTitle:"Первый сектор",examinerName:"Преподаватель Тестовый",issuedAt:"2026-11-04T06:00:00Z",examAt:"2026-11-04T06:00:00Z"}:[]}}));
  await page.goto("/certificates/exam-1");
  await expect(page.getByRole("article")).toContainText("Ученица Примерова");
  await expect(page.getByRole("button",{name:"Сохранить PDF или распечатать"})).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/certificates/exam-1");
  await page.emulateMedia({media:"print"});
  await expect(page.getByRole("article")).toBeVisible();
  await expect(page.getByRole("button",{name:"Сохранить PDF или распечатать"})).toBeHidden();
});
