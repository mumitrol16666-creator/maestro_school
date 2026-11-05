import {test,expect} from "@playwright/test";
const direction={id:"11111111-1111-4111-8111-111111111111",title:"Гитара",crmDirectionId:"crm-guitar"};
const program={id:"33333333-3333-4333-8333-333333333333",directionId:direction.id,sectorNumber:1,title:"Первый сектор",durationMinutes:15,revision:2,items:[{title:"Сыграть песню",criteria:"Ровный темп"}],direction};
const planId="22222222-2222-4222-8222-222222222222";

test("an admin creates custom tasks, assembles six pupils and assigns their exam without leaving the app",async({page,context})=>{
  const user={id:"qa-admin",role:"admin",firstName:"Администратор",permissions:["offline_school.read","offline_school.write"]};
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  let programs:typeof program[]=[];
  let sessions:any[]=[];
  let submitted:any=null, booking:any=null;
  const rows=Array.from({length:6},(_,i)=>({planId:`plan-${i}`,sequence:1,curriculumNumber:1,crmStudentId:`s${i}`,studentName:`Ученик Примеров ${i+1}`,direction,goal:"Материалы сектора",progress:{completed:2,total:5,percent:40,ready:true},exam:null}));
  await page.route("**/api/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/,"");
    const method=route.request().method(); let data:unknown=[];
    if(path==="/auth/me") data=user;
    else if(path==="/admin/sector-exams") data={sectors:rows,groupSectors:[]};
    else if(path==="/admin/exam-programs") {
      if(method==="POST") {programs=[{...program,...route.request().postDataJSON()}];data=programs[0];}
      else data=programs;
    }
    else if(path==="/admin/exam-program-directions") data=[direction];
    else if(path==="/admin/exam-sessions") {
      if(method==="POST") {
        submitted=route.request().postDataJSON();
        sessions=[{id:"session-1",title:submitted.title,programId:program.id,programRevision:2,programSnapshot:programs[0],exams:submitted.planIds.map((id:string)=>({id:`exam-${id}`,planId:id,studentNameSnapshot:rows.find(r=>r.planId===id)!.studentName,crmStudentId:id,status:"draft",scheduledAt:null,plan:{examReadyAt:"2026-11-05T04:30:00Z"}}))}];data=sessions[0];
      } else data=sessions;
    } else if(path==="/admin/exam-sessions/session-1/participants") {
      const body=route.request().postDataJSON();
      sessions[0].exams=body.planIds.map((id:string)=>({id:`exam-${id}`,planId:id,studentNameSnapshot:rows.find(r=>r.planId===id)!.studentName,crmStudentId:id,status:"draft",scheduledAt:null,plan:{examReadyAt:"2026-11-05T04:30:00Z"}}));data=sessions[0];
    } else if(path==="/admin/exam-scheduling-options") data={teachers:[{id:"examiner",name:"Принимающий преподаватель"}],rooms:[{id:"room",name:"Зал"}]};
    else if(path==="/admin/exam-sessions/session-1/schedule") {
      booking=route.request().postDataJSON();sessions[0].exams.forEach((exam:any)=>{exam.status="scheduled";exam.scheduledAt="2026-11-20T05:00:00Z";});data={crmClassId:"lesson"};
    }
    return route.fulfill({json:{data}});
  });
  await page.goto("/admin/sector-exams");
  const builder=page.getByTestId("exam-event-builder");
  await builder.getByRole("button",{name:"Новый экзамен",exact:true}).click();
  await builder.getByRole("textbox",{name:"Название экзамена",exact:true}).fill("Переход в квартеты");
  await builder.getByRole("textbox",{name:"Задание 1",exact:true}).fill("Сыграть партию с ансамблем");
  await builder.getByRole("textbox",{name:"Что считается выполнением",exact:true}).fill("Ровный общий темп");
  await builder.getByRole("button",{name:"Сохранить экзамен и выбрать учеников"}).click();
  await expect(builder.getByRole("combobox",{name:"Экзамен",exact:true})).toHaveValue(program.id);
  for(let i=1;i<=4;i++) await builder.getByRole("checkbox",{name:new RegExp(`Ученик Примеров ${i} `)}).check();
  await builder.getByRole("button",{name:"Подготовить экзамен · 4 участников"}).click();
  expect(submitted.planIds).toHaveLength(4); expect(booking).toBeNull();
  await builder.getByRole("button",{name:"Изменить участников"}).click();
  for(let i=5;i<=6;i++) await builder.getByRole("checkbox",{name:new RegExp(`Ученик Примеров ${i} `)}).check();
  await builder.getByRole("button",{name:"Сохранить состав",exact:true}).click();
  await expect(builder.getByText("Переход в квартеты · 6 участников",{exact:true})).toBeVisible();
  await builder.getByRole("button",{name:"Назначить дату и преподавателя"}).click();
  await builder.getByLabel("Дата экзамена",{exact:true}).fill("2026-11-20");
  await builder.getByRole("combobox",{name:/^Принимающий преподаватель/}).selectOption("examiner");
  await builder.getByRole("combobox",{name:/^Кабинет/}).selectOption("room");
  await builder.getByRole("button",{name:"Назначить экзамен",exact:true}).click();
  await expect(builder.getByText("Экзамен назначен",{exact:true})).toBeVisible();
  expect(booking).toMatchObject({date:"2026-11-20",teacherId:"examiner",roomId:"room",startTime:"10:00",endTime:"11:00"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await builder.screenshot({path:`/Library/Project/Maestro/output/exam-flow-2026-11-05/exam-builder-${test.info().project.name}.png`});
});

test("the appointed teacher conducts all six pupils on their saved exam checklist and prints a protocol",async({page,context})=>{
  const user={id:"qa-examiner",role:"teacher",firstName:"Преподаватель",permissions:["offline_school.read","offline_school.write"]};
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  const participants=Array.from({length:6},(_,i)=>({studentName:`Ученик Примеров ${i+1}`,ready:true,canConduct:true,canStart:true,exam:{id:`exam-${i}`,sessionId:"session-1",planId:`plan-${i}`,crmStudentId:`s${i}`,status:"scheduled",attempt:1,scheduledAt:"2026-11-20T05:00:00Z",outcome:null,comment:null,items:[{id:`item-${i}`,kind:"custom",title:"Сыграть партию с ансамблем",criteria:"Ровный общий темп",done:null as boolean|null}]}}));
  await page.route("**/api/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    let data:any=[];
    if(path.endsWith("/auth/me")) data=user;
    else if(path.endsWith("/exam-sessions/session-1")) data={id:"session-1",title:"Переход в квартеты",program:{items:[{title:"Сыграть партию с ансамблем",criteria:"Ровный общий темп"}]},participants};
    else {
      const match=path.match(/sector-exams\/(exam-\d+)\/(.*)/);
      if(match){const person=participants.find(p=>p.exam.id===match[1])!;const action=match[2];
        if(action==="start")person.exam.status="in_progress";
        if(action.startsWith("items/"))person.exam.items[0].done=route.request().postDataJSON().done;
        if(action==="finish"){person.exam.status="completed";Object.assign(person.exam,{outcome:"passed",certificate:{number:`MS-2026-${person.exam.id}`}});data={exam:person.exam,awardedPoints:250};}
        else data=person.exam;
      }
    }
    return route.fulfill({json:{data}});
  });
  await page.goto("/admin/exam-sessions/session-1");
  await expect(page.getByTestId("exam-session-participant")).toHaveCount(6);
  for(let i=0;i<6;i++){
    const card=page.getByTestId("exam-session-participant").nth(i);
    await card.getByRole("button",{name:"Начать экзамен ученика"}).click();
    await card.getByRole("button",{name:"Сделано",exact:true}).click();
    await card.getByRole("button",{name:"Сдал экзамен",exact:true}).click();
    await expect(card.getByText(/Сертификат/).first()).toBeVisible();
  }
  expect(participants.every(p=>p.exam.status==="completed")).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.emulateMedia({media:"print"});
  await expect(page.locator("[data-exam-protocol]")).toBeVisible();
  await expect(page.locator("[data-exam-protocol] section")).toHaveCount(6);
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
