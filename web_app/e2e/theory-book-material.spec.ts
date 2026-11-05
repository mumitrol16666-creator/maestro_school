import {test,expect} from "@playwright/test";
import {getPreparedTestTheory} from "../../backend/src/domain/prepared-test-theory";
import {preparedTestTemplates} from "../../backend/src/domain/prepared-tests";

test("a later theory chapter shows the actual book material and continues to its test",async({page,context},testInfo)=>{
  const user={id:"qa-admin",role:"admin",firstName:"Администратор",permissions:["offline_school.read","offline_school.write"]};
  const template=preparedTestTemplates.find(row=>row.id==="theory-4-4")!;
  await context.addInitScript(user=>{localStorage.setItem("maestro_access_token","fixture");localStorage.setItem("maestro_auth_user",JSON.stringify(user));},user);
  await page.route("**/api/v1/**",route=>route.fulfill({json:{data:route.request().url().endsWith("/auth/me")?user:route.request().url().endsWith("/admin/tests/theory-4-4/preview")?{
    ...template,order:18,totalTests:25,passingScore:80,maxAttempts:2,dailyRules:{attemptLimit:2,testLimit:1},xpRules:{firstAttempt:20,retry:10},theory:getPreparedTestTheory(template.id),
  }:[]}}));
  await page.goto("/admin/tests/theory-4-4/preview");
  const material=page.locator("[data-theory-print]");
  await expect(material).toContainText("Строение минорного трезвучия");
  await expect(material).toContainText("четвёртая на втором ладу — E, третья на втором — A");
  await expect(material).toContainText("раздел 4.4, стр. 34, 35");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath("theory-book.png"),fullPage:true});
  await material.getByRole("button",{name:"Посмотреть вопросы"}).click();
  await expect(page.getByText(template.questions[0]!.prompt,{exact:true})).toBeVisible();
});
