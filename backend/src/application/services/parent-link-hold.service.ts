import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { formatFio } from "../../domain/name.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { curatorWorkspaceV2Enabled, upsertAdminJournalEntry } from "./admin-journal.service.js";

/**
 * A phone and a name are not proof of identity: anyone can register a «child» in the app with a real
 * student's phone and name. When the school then gives that CRM student the account, the parent who made
 * it in the app (`createdById = parentUserId`) must not see the school's data before the school has
 * checked them. Their links are put on hold (inactive) and returned, so CRM can confirm a parent through
 * its own «link a parent» step with an identity check, which re-activates the same link. The password that
 * parent set stops working too, even when CRM asks to keep it: otherwise the parent signs in as the child.
 * Links made by the school (an administrator or CRM) are left as they are. Runs on every new CRM student
 * link of an account (`applyUserLink`): provision-student and CRM's «Связать» alike.
 */
export async function holdParentMadeAccess(studentUserId: string, crmStudentId: string, password: string | null | undefined) {
  const links = await prisma.parentStudentLink.findMany({
    where: { studentUserId },
    select: {
      id: true,
      parentUserId: true,
      createdById: true,
      isActive: true,
      relationship: true,
      parent: { select: { login: true, firstName: true, lastName: true, middleName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // A revoked parent-made link still means that parent once set the child's password.
  const parentMade = links.filter((link) => link.createdById === link.parentUserId);
  if (parentMade.length === 0) {
    return { passwordReplaced: false, heldParentLinks: [], temporaryPassword: null };
  }

  const held = parentMade.filter((link) => link.isActive);
  const newPassword = password?.trim() || crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction(async (tx) => {
    if (held.length > 0) {
      await tx.parentStudentLink.updateMany({
        where: { id: { in: held.map((link) => link.id) } },
        data: { isActive: false, revokedAt: new Date() },
      });
    }
    // The password change also bumps the session version (a database trigger): open sessions end. Push
    // subscriptions are not sessions: the device the parent signed in on as the child would keep getting
    // the school's notifications.
    await tx.user.update({ where: { id: studentUserId }, data: { passwordHash } });
    await tx.pushSubscription.deleteMany({ where: { userId: studentUserId } });
    if (curatorWorkspaceV2Enabled()) {
      for (const link of held) {
        await upsertAdminJournalEntry({
          sourceKey: `parent-access:${link.id}:held`,
          type: "parent_access",
          severity: "high",
          source: "crm",
          linkedEntityType: "parent_student_link",
          linkedEntityId: link.id,
          title: "Родительский доступ ждёт проверки",
          summary: "Ученик школы получил аккаунт, который создал родитель в приложении. Родитель не видит данных ребёнка, пока администратор не проверит его личность и не привяжет заново.",
          payload: { operation: "held_on_school_link", studentId: studentUserId, crmStudentId, parentUserId: link.parentUserId },
        }, tx);
      }
    }
  });

  return {
    passwordReplaced: true,
    heldParentLinks: held.map((link) => ({
      linkId: link.id,
      parentUserId: link.parentUserId,
      login: link.parent.login,
      fullName: formatFio(link.parent),
      phone: link.parent.phone,
      relationship: link.relationship,
    })),
    temporaryPassword: password?.trim() ? null : newPassword,
  };
}
