import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { normalizeLogin, isValidLogin } from "../../lib/login.js";
import { normalizePhoneDigits, isValidPhone } from "../../lib/phone.js";

const accountSelect = { id: true, login: true, firstName: true, lastName: true, middleName: true, phone: true,
  isActive: true, deletedAt: true, role: { select: { slug: true } } } as const;
export async function getCrmFamilyAccess(crmStudentId: string) {
  const student = await prisma.user.findFirst({ where: { crmStudentId, role: { slug: "student" }, crmTeacherId: null, ...notDeleted }, select: accountSelect });
  if (!student) return { student: null, parents: [] };
  const links = await prisma.parentStudentLink.findMany({ where: { studentUserId: student.id, isActive: true,
    parent: { isActive: true, ...notDeleted, role: { slug: "parent" } } }, select: { id: true, relationship: true, parent: { select: accountSelect } } });
  // Link and handover are not evidence of a first login.
  return { student, parents: links.map(link => ({ linkId: link.id, relationship: link.relationship, ...link.parent })) };
}
export async function previewCrmParent(loginInput: string) {
  const login = normalizeLogin(loginInput);
  if (!isValidLogin(login)) throw new BadRequestError("Укажите логин родительского кабинета");
  const parent = await prisma.user.findFirst({ where: { login, isActive: true, role: { slug: "parent" }, ...notDeleted }, select: accountSelect });
  if (!parent) throw new NotFoundError("Родитель с таким логином не найден");
  return parent;
}
export type CrmParentInput = {
  crmStudentId: string; operationId: string; crmActorId: string; mode: "create" | "link";
  login: string; firstName?: string; lastName?: string; middleName?: string; phone?: string; password?: string;
  parentUserId?: string; identityVerified: boolean; relationship: "mother" | "father" | "guardian";
};
export async function provisionCrmParent(input: CrmParentInput) {
  if (!input.identityVerified) throw new BadRequestError("Подтвердите личность и право представительства родителя");
  const login = normalizeLogin(input.login);
  if (!isValidLogin(login)) throw new BadRequestError("Логин: 3–32 символа, латиница, цифры и _");
  if (input.mode === "create" && (!input.firstName?.trim() || !input.lastName?.trim() || !isValidPhone(input.phone || "")
      || !input.password || input.password.length < 8 || Buffer.byteLength(input.password, "utf8") > 72)) {
    throw new BadRequestError("Заполните ФИО, телефон и отдельный пароль родителя (8–72 байта)");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, password: undefined, crmActorId: undefined })).digest("hex");
  // Passwords never go into operation records and retries never reset an existing account.
  const hash = input.mode === "create" ? await bcrypt.hash(input.password!, 10) : null;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-parent:${input.operationId}`}, 0)) IS NULL`;
    const prior = await tx.crmFamilyProvision.findUnique({ where: { operationId: input.operationId } });
    if (prior) {
      const link = await tx.parentStudentLink.findFirst({ where: { id: prior.linkId, isActive: true,
        parent: { isActive: true, role: { slug: "parent" }, ...notDeleted },
        student: { crmStudentId: input.crmStudentId, role: { slug: "student" }, ...notDeleted } }, include: { parent: { select: accountSelect } } });
      // After a lost response, an admin may find the already-created parent by login.
      // Only that exact parent/link can recover this operation; never switch family identity.
      const recoveringSameParent = input.mode === "link" && link && input.parentUserId === link.parent.id
        && login === link.parent.login && input.relationship === link.relationship;
      if (prior.fingerprint !== fingerprint && !recoveringSameParent) throw new ConflictError("Операция уже использована с другими данными");
      if (!link) throw new ConflictError("Ранее созданная связь отключена. Проверьте доступ в приложении.");
      return { parent: link.parent, linkId: link.id, created: false, repeated: true };
    }
    const student = await tx.user.findFirst({ where: { crmStudentId: input.crmStudentId, crmTeacherId: null, isActive: true, role: { slug: "student" }, ...notDeleted } });
    if (!student) throw new NotFoundError("Сначала создайте кабинет ученика");
    let parent;
    if (input.mode === "link") {
      parent = await tx.user.findFirst({ where: { id: input.parentUserId, login, isActive: true, role: { slug: "parent" }, ...notDeleted }, select: accountSelect });
      if (!input.parentUserId || !parent) throw new ConflictError("Сначала найдите родителя по логину и проверьте выбранную карточку");
    } else {
      const exists = await tx.user.findUnique({ where: { login }, select: { id: true } });
      if (exists) throw new ConflictError("Логин занят. Для существующего родителя используйте поиск и подтверждение связи.");
      const role = await tx.role.findUnique({ where: { slug: "parent" } });
      if (!role) throw new BadRequestError("Роль родителя не настроена");
      const phone = normalizePhoneDigits(input.phone!);
      parent = await tx.user.create({ data: { login, phone, phoneNormalized: phone, firstName: input.firstName!.trim(),
        lastName: input.lastName!.trim(), middleName: input.middleName?.trim() || null, passwordHash: hash!, roleId: role.id, leagueEligible: false }, select: accountSelect });
    }
    const link = await tx.parentStudentLink.upsert({ where: { parentUserId_studentUserId: { parentUserId: parent.id, studentUserId: student.id } },
      create: { parentUserId: parent.id, studentUserId: student.id, relationship: input.relationship },
      update: { isActive: true, revokedAt: null, relationship: input.relationship } });
    await tx.crmFamilyProvision.create({ data: { operationId: input.operationId, fingerprint, crmStudentId: input.crmStudentId,
      crmActorId: input.crmActorId, linkId: link.id } });
    return { parent, linkId: link.id, created: input.mode === "create", repeated: false };
  });
}
