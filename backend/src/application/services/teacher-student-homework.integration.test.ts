import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { getTeacherStudentHomework, resolveLegacyHomework } from "./teacher-student-homework.service.js";
import { productFeatureConfig } from "../../config/product-features.js";

const integration = process.env.RUN_HOMEWORK_DB_TESTS === "1" ? test : test.skip;
integration("teacher legacy homework: roster scope, atomic replay, stale edit, audit and zero reward writes", async t => {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(db.hostname));
  assert.equal(db.pathname, "/maestro_homework_qa_20260913", "Only the dedicated disposable database is allowed");
  assert.equal(process.env.MAESTRO_QA_LOCAL, "true");
  const suffix = randomUUID();
  const role = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "Teacher" }, update: {} });
  const actor = await prisma.user.create({ data: { login: `homework-qa-${suffix}`, phone: "+70000000001", passwordHash: "test-only", firstName: "Test", lastName: "Teacher", roleId: role.id, crmTeacherId: `teacher-${suffix}` } });
  const studentId = `student-${suffix}`;
  const assignmentIds: string[] = [], topicIds: string[] = [], directionIds: string[] = [];
  const lessons = ["old", "foreign", "concurrent", "rollback", "group"].map(id => ({ crmClassId: `${id}-${suffix}`, title: "Урок", topic: id, date: "2026-08-27", status: "completed", homework: "Припев", crmTeacherId: id === "foreign" || id === "group" ? "other" : actor.crmTeacherId, ...(id === "group" ? { crmGroupId: "own-group" } : {}), lessonPointsAwarded: 100 }));
  let direct = true, group = false, unavailable = false;
  const network: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    assert.equal(init?.method ?? "GET", "GET", "No CRM business writes are allowed");
    const path = new URL(String(url)).pathname; network.push(path);
    let data: unknown;
    if (path.endsWith("/students") && path.includes("/teachers/")) data = { students: direct ? [{ crmStudentId: studentId, name: "Test Student", directions: ["Гитара"] }] : [] };
    else if (path.endsWith("/groups")) data = { groups: group ? [{ crmGroupId: "own-group", direction: "Гитара", students: [{ crmStudentId: studentId, name: "Test Student" }] }] : [] };
    else if (path.endsWith("/offline-summary")) {
      if (unavailable) throw new Error("CRM offline");
      data = { lessonHistory: lessons };
    } else if (path.endsWith("/directions")) data = { directions: [{ crmDirectionId: "guitar", title: "Гитара", isActive: true, updatedAt: "2026-09-01T00:00:00Z" }, { crmDirectionId: "voice", title: "Вокал", isActive: true, updatedAt: "2026-09-01T00:00:00Z" }] };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  });
  const flags = { ...productFeatureConfig.flags };
  productFeatureConfig.flags.learningTopicsV2 = false;
  t.after(async () => {
    Object.assign(productFeatureConfig.flags, flags);
    const records = await prisma.legacyHomeworkResolution.findMany({ where: { crmStudentId: studentId }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityType: "legacy_homework_resolution", entityId: { in: records.map(item => item.id) } } });
    await prisma.legacyHomeworkResolution.deleteMany({ where: { crmStudentId: studentId } });
    await prisma.learningHomeworkAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.learningTopic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.direction.deleteMany({ where: { id: { in: directionIds } } });
    await prisma.user.delete({ where: { id: actor.id } });
    await prisma.$disconnect();
  });
  const counters = () => Promise.all([prisma.pointsTransaction.count(), prisma.maestroCoinTransaction.count(), prisma.learningTopicProgress.count(), prisma.weeklyLeagueActivityEvent.count()]);
  const before = await counters();
  const request = (classIndex: number) => ({ teacherId: actor.id, crmStudentId: studentId, crmClassId: lessons[classIndex].crmClassId, decision: "accepted" as const, comment: "", expectedRevision: 0, requestKey: randomUUID() });
  const workspace = await getTeacherStudentHomework(actor.id, studentId);
  assert.equal(workspace.items.length, 5);
  assert.equal(workspace.items.find(item => item.crmClassId === lessons[1].crmClassId)?.canResolve, false);
  await assert.rejects(resolveLegacyHomework(request(1)), { statusCode: 403 });
  const first = request(0);
  const both = await Promise.all([resolveLegacyHomework(first), resolveLegacyHomework(first)]);
  assert.equal(both.filter(item => item.idempotent).length, 1);
  const saved = await prisma.legacyHomeworkResolution.findFirstOrThrow({ where: { crmStudentId: studentId, crmClassId: first.crmClassId } });
  assert.equal(saved.revision, 1); assert.equal((saved.history as unknown[]).length, 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: saved.id } }), 1);
  await assert.rejects(resolveLegacyHomework({ ...first, requestKey: randomUUID() }), { code: "HOMEWORK_STALE_VERSION" });
  await resolveLegacyHomework({ ...first, decision: "continue", comment: "Повторить медленно", expectedRevision: 1, requestKey: randomUUID() });
  const refreshed = await getTeacherStudentHomework(actor.id, studentId);
  assert.equal(refreshed.items.find(item => item.crmClassId === first.crmClassId)?.state, "continue");
  const competing = await Promise.allSettled([resolveLegacyHomework(request(2)), resolveLegacyHomework(request(2))]);
  assert.equal(competing.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(competing.filter(item => item.status === "rejected").length, 1);
  // An audit failure must roll back the corresponding decision row as well.
  await prisma.$executeRawUnsafe("CREATE FUNCTION homework_qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type = 'legacy_homework_resolution' AND NEW.payload->>'crmClassId' LIKE 'rollback-%' THEN RAISE EXCEPTION 'injected QA audit failure'; END IF; RETURN NEW; END $$");
  await prisma.$executeRawUnsafe("CREATE TRIGGER homework_qa_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION homework_qa_fail_audit()");
  try {
    await assert.rejects(resolveLegacyHomework(request(3)));
    assert.equal(await prisma.legacyHomeworkResolution.count({ where: { crmStudentId: studentId, crmClassId: lessons[3].crmClassId } }), 0);
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER homework_qa_fail_audit ON audit_logs");
    await prisma.$executeRawUnsafe("DROP FUNCTION homework_qa_fail_audit()");
  }
  direct = false; group = true;
  await resolveLegacyHomework(request(4));
  direct = false; group = false;
  await assert.rejects(getTeacherStudentHomework(actor.id, studentId), { statusCode: 403 });
  await assert.rejects(resolveLegacyHomework(request(0)), { statusCode: 403 });
  direct = true; unavailable = true;
  assert.equal((await getTeacherStudentHomework(actor.id, studentId)).partial, true);
  await assert.rejects(resolveLegacyHomework(request(0)), { statusCode: 409 });
  unavailable = false;
  // A canonical assignment replaces the aggregate report; foreign directions are not leaked.
  productFeatureConfig.flags.learningTopicsV2 = true;
  productFeatureConfig.flags.homeworkFlowV2 = true;
  for (const [crmDirectionId, title] of [["guitar", "Гитара"], ["voice", "Вокал"]]) {
    const direction = await prisma.direction.create({ data: { slug: `${crmDirectionId}-${suffix}`, title, crmDirectionId } }); directionIds.push(direction.id);
    const topic = await prisma.learningTopic.create({ data: { directionId: direction.id, crmStudentId: studentId, title } }); topicIds.push(topic.id);
    const assignment = await prisma.learningHomeworkAssignment.create({ data: { topicId: topic.id, createdById: actor.id, instructions: title, sourceLessonId: lessons[0].crmClassId, idempotencyKey: `qa-${topic.id}`, recipients: { create: { crmStudentId: studentId } } } }); assignmentIds.push(assignment.id);
  }
  const canonical = await getTeacherStudentHomework(actor.id, studentId);
  assert.equal(canonical.items.filter(item => item.model === "learning_homework_v2").length, 1);
  assert.equal(canonical.items.some(item => item.title === "Вокал"), false);
  assert.equal(canonical.items.some(item => item.model === "legacy" && item.crmClassId === lessons[0].crmClassId), false);
  assert.equal(canonical.items.find(item => item.model === "learning_homework_v2")?.reviewHref, null);
  await assert.rejects(resolveLegacyHomework(request(0)), { statusCode: 404 });
  assert.deepEqual(await counters(), before);
  assert.ok(network.length > 0);
});
