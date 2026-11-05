import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { getLearningConversation, listLearningConversations } from "./learning-dialog.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("closed dialogs are archived without losing history or changing membership access", async () => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /^\/maestro_(?:regression|sectors_\w+)$/);
  const suffix = randomUUID();
  const role = await prisma.role.create({ data: { slug: `dialog-folder-${suffix}`, name: "Dialog folder fixture" } });
  const users = await Promise.all(["teacher", "student", "outsider"].map((name, index) => prisma.user.create({ data: {
    login: `dialog-folder-${name}-${suffix}`, phone: `fixture-${suffix.slice(0, 16)}-${index}`, firstName: name, lastName: "Fixture", passwordHash: "test-only", roleId: role.id,
  } })));
  const [teacher, student, outsider] = users;
  const ids: string[] = [];
  try {
    for (const kind of ["active", "read_only", "closed", "manual"] as const) {
      const conversation = await prisma.learningConversation.create({ data: {
        sourceKey: `test:dialog-folder:${suffix}:${kind}`, type: "learning_direction",
        status: kind === "manual" ? "active" : kind,
        members: { create: [
          { userId: teacher.id, role: "teacher", archivedAt: kind === "manual" ? new Date() : null },
          { userId: student.id, role: "student" },
        ] },
        messages: kind === "read_only" ? { create: {
          sourceKey: `test:dialog-folder-message:${suffix}`, authorId: student.id,
          versions: { create: { sourceKey: `test:dialog-folder-version:${suffix}`, version: 1, kind: "created", body: "Сохранённая история" } },
        } } : undefined,
      } });
      ids.push(conversation.id);
    }
    const actor = { userId: teacher.id, roleSlug: "teacher" };
    const fixtureIds = (rows: Array<{ id: string }>) => rows.filter(row => ids.includes(row.id)).map(row => row.id).sort();
    assert.deepEqual(fixtureIds(await listLearningConversations(actor, { limit: 100, archive: "active" })), [ids[0]]);
    assert.deepEqual(fixtureIds(await listLearningConversations(actor, { limit: 100, archive: "archived" })), ids.slice(1).sort());
    assert.deepEqual(fixtureIds(await listLearningConversations(actor, { limit: 100, archive: "all" })), [...ids].sort());
    // Personal archive preferences remain personal; a closed status applies to every participant.
    assert.deepEqual(fixtureIds(await listLearningConversations({ userId: student.id, roleSlug: "student" }, { limit: 100, archive: "active" })), [ids[0], ids[3]].sort());
    const admin = { userId: outsider.id, roleSlug: "admin" };
    assert.deepEqual(fixtureIds(await listLearningConversations(admin, { limit: 100, archive: "archived" })), [ids[1], ids[2]].sort());
    assert.deepEqual(fixtureIds(await listLearningConversations({ userId: outsider.id, roleSlug: "teacher" }, { limit: 100, archive: "archived" })), []);
    const history = await getLearningConversation(actor, ids[1], { limit: 100 });
    assert.equal(history.messages[0].body, "Сохранённая история");
    assert.equal(history.canWrite, false);
    await assert.rejects(getLearningConversation({ userId: outsider.id, roleSlug: "teacher" }, ids[1], { limit: 100 }));
  } finally {
    await prisma.learningConversation.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.role.delete({ where: { id: role.id } });
  }
});
