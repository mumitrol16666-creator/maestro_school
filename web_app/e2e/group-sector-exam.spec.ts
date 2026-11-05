import {test,expect} from "@playwright/test";
test("a quartet uses its members' personal sectors and has no manual group exam or pass",async({page,context})=>{
  const user={id:"qa-group-teacher",role:"teacher",firstName:"Учитель",permissions:["offline_school.read","offline_school.write"]};
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  await page.route("**/api/v1/**",route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path.endsWith("/auth/me")?user:path.endsWith("/teachers/me/groups")?{groups:[{crmGroupId:"quartet",name:"Квартет",direction:"Гитара",students:Array.from({length:4},(_,i)=>({crmStudentId:`student-${i}`,name:`Участник ${i+1}`}))}]}:path.endsWith("/learning-plan-mode")?{mode:"v2",directions:[]}:[];
    return route.fulfill({json:{data}});
  });
  await page.goto("/admin/my-students/group/quartet/plan");
  await expect(page.getByRole("heading",{name:"Личные сектора участников"})).toBeVisible();
  for(let i=1;i<=4;i++)await expect(page.getByText(`Участник ${i}`,{exact:true})).toBeVisible();
  await expect(page.getByText("Прежние общие экзамены группы")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Засчитать|Подготовить экзамен группы|Закрыть сектор группы/})).toHaveCount(0);
});
