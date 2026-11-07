import { z } from "zod";
import { prisma } from "../../infrastructure/database/prisma.js";
import { ForbiddenError, NotFoundError, ConflictError } from "../../domain/errors.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { getParentVisibility } from "./parent-visibility.service.js";
import { getPersonalExam } from "./sector-exam.service.js";

const snapshotSchema = z.object({
  studentName: z.string().min(1), direction: z.string().min(1), sectorNumber: z.number().int().positive(),
  programTitle: z.string().min(1), examinerName: z.string(), issuedAt: z.string().datetime(), examAt: z.string().datetime(),
});

/** Every viewer uses current access; printed identity and result are frozen at issue time. */
export async function getSectorCertificate(actorUserId: string, examId: string) {
  const [actor, exam] = await Promise.all([
    prisma.user.findFirst({ where: { id: actorUserId, isActive: true, deletedAt: null }, include: { role: { select: { slug: true } } } }),
    prisma.sectorExam.findUnique({ where: { id: examId } }),
  ]);
  if (!actor || !exam) throw new NotFoundError("Сертификат");
  const role = actor.role.slug;
  if (role === "student") {
    if (actor.crmStudentId !== exam.crmStudentId) throw new NotFoundError("Сертификат");
  } else if (role === "parent") {
    const link = await prisma.parentStudentLink.findFirst({ where: {
      parentUserId: actor.id, isActive: true,
      student: { crmStudentId: exam.crmStudentId, isActive: true, deletedAt: null, role: { slug: "student" } },
    }, select: { studentUserId: true } });
    if (!link) throw new NotFoundError("Сертификат");
    if (!(await getParentVisibility(link.studentUserId)).showPlanProgress) throw new ForbiddenError("Учебные результаты скрыты настройками семейного доступа");
  } else if (role === "teacher") {
    await getPersonalExam(actor.id, exam.id);
  } else if (!isOfflineCoordinatorRole(role)) {
    throw new ForbiddenError("Сертификат недоступен");
  }
  if (!exam.certificateNumber || !exam.certificateIssuedAt || exam.status !== "completed" || !["pass", "close_sector"].includes(exam.decision ?? "")) throw new NotFoundError("Сертификат ещё не выдан");
  const snapshot = snapshotSchema.safeParse(exam.certificateSnapshot);
  if (!snapshot.success) throw new ConflictError("У прежнего сертификата нет сохранённых данных для печати. Обратитесь к администратору.", "CERTIFICATE_SNAPSHOT_MISSING");
  return { id: exam.id, number: exam.certificateNumber, ...snapshot.data };
}
