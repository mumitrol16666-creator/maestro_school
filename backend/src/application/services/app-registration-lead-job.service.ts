import { prisma } from "../../infrastructure/database/prisma.js";
import { normalizePhoneDigits } from "../../lib/phone.js";
import { parentRegistrationLeadComment, sendAppRegistrationLead } from "./app-registration.service.js";

/**
 * Stage 4: a registration in the app is a lead in CRM, sent right after the account is stored. If CRM
 * is down, the account keeps `crmLeadPendingSince`, and every ten minutes this job sends the lead
 * again — the same `externalSourceId` (`app-registration:<userId>`), so CRM answers «already there»
 * and never makes a second request. A lead that CRM has not accepted in seven days is given up on:
 * one error in the log with the user id, and the flag is cleared.
 *
 * Several runs at once are harmless (CRM is idempotent); a run inside one process never overlaps.
 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MIN_AGE_MS = 2 * 60 * 1000;
const GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
/** Stop the run when CRM keeps failing: the next run is in ten minutes. */
const STOP_AFTER_FAILURES = 3;

let running = false;

export async function retryPendingAppRegistrationLeads(now = new Date()) {
  const result = { sent: 0, failed: 0, gaveUp: 0, cleared: 0 };
  if (running) return result;
  running = true;
  try {
    // Linked to a CRM student in the meantime (the school already knows this person): nothing to send.
    const linked = await prisma.user.updateMany({
      where: { crmLeadPendingSince: { not: null }, crmStudentId: { not: null } },
      data: { crmLeadPendingSince: null },
    });
    // A parent whose child the school has linked since, or an account switched off or deleted: no lead either.
    const settled = await prisma.user.updateMany({
      where: {
        crmLeadPendingSince: { not: null },
        OR: [
          { isActive: false },
          { deletedAt: { not: null } },
          { parentLinksAsParent: { some: { revokedAt: null, student: { crmStudentId: { not: null } } } } },
        ],
      },
      data: { crmLeadPendingSince: null },
    });
    result.cleared = linked.count + settled.count;

    const expired = await prisma.user.findMany({
      where: { crmLeadPendingSince: { lt: new Date(now.getTime() - GIVE_UP_AFTER_MS) }, crmStudentId: null },
      select: { id: true },
      orderBy: { crmLeadPendingSince: "asc" },
      take: BATCH_SIZE,
    });
    for (const user of expired) {
      console.error(`[app-registration] ERROR CRM lead for user ${user.id} was not delivered in 7 days; giving up, add it by hand`);
      await prisma.user.update({ where: { id: user.id }, data: { crmLeadPendingSince: null } });
      result.gaveUp += 1;
    }

    const pending = await prisma.user.findMany({
      where: {
        crmLeadPendingSince: { lte: new Date(now.getTime() - MIN_AGE_MS), gte: new Date(now.getTime() - GIVE_UP_AFTER_MS) },
        crmStudentId: null,
        deletedAt: null,
        isActive: true,
      },
      orderBy: { crmLeadPendingSince: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true, firstName: true, lastName: true, phone: true,
        role: { select: { slug: true } },
        parentLinksAsParent: {
          where: { revokedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { student: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    });
    let failures = 0;
    for (const user of pending) {
      const child = user.role.slug === "parent" ? user.parentLinksAsParent[0]?.student : undefined;
      const sent = await sendAppRegistrationLead({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: normalizePhoneDigits(user.phone),
        logFailure: false,
        ...(child ? { comment: parentRegistrationLeadComment(child) } : {}),
      });
      if (sent) {
        result.sent += 1;
        failures = 0;
      } else {
        result.failed += 1;
        failures += 1;
        if (failures >= STOP_AFTER_FAILURES) break;
      }
    }
    return result;
  } finally {
    running = false;
  }
}

export function startAppRegistrationLeadJob() {
  const run = () => {
    retryPendingAppRegistrationLeads().catch((error) => {
      console.error("app registration lead job failed", error);
    });
  };
  const initial = setTimeout(run, 2 * 60 * 1000);
  initial.unref();
  const interval = setInterval(run, CHECK_INTERVAL_MS);
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
