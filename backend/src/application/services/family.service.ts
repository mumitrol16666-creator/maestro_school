import bcrypt from "bcryptjs";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { buildFamilyOfflineSummary } from "../../domain/family-view.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";

export type FamilyRelationship = "mother" | "father" | "guardian" | "other";

const parentSelect = {
  id: true,
  login: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  isActive: true,
  role: { select: { slug: true } },
} as const;

function parentLinkView(link: {
  id: string;
  relationship: string;
  isActive: boolean;
  parent: {
    id: string;
    login: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
    phone: string;
    isActive: boolean;
    role: { slug: string };
  };
}) {
  return {
    linkId: link.id,
    relationship: link.relationship,
    isActive: link.isActive,
    parent: {
      id: link.parent.id,
      login: link.parent.login,
      firstName: link.parent.firstName,
      lastName: link.parent.lastName,
      middleName: link.parent.middleName,
      fullName: formatFio(link.parent),
      phone: link.parent.phone,
      isActive: link.parent.isActive,
      role: link.parent.role.slug,
    },
  };
}

async function assertStudent(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, ...notDeleted },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Student");
  return student;
}

export async function listStudentParents(studentId: string) {
  await assertStudent(studentId);
  const links = await prisma.parentStudentLink.findMany({
    where: { studentUserId: studentId, isActive: true },
    include: { parent: { select: parentSelect } },
    orderBy: { createdAt: "asc" },
  });
  return links.map(parentLinkView);
}

export async function createParentForStudent(params: {
  studentId: string;
  actorId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  login: string;
  password: string;
  relationship: FamilyRelationship;
}) {
  await assertStudent(params.studentId);
  if (!isValidPhone(params.phone)) {
    throw new BadRequestError("Укажите корректный номер телефона родителя");
  }
  const login = normalizeLogin(params.login);
  if (!isValidLogin(login)) {
    throw new BadRequestError("Логин: 3–32 символа, латиница, цифры и _");
  }

  const [existingLogin, parentRole] = await Promise.all([
    prisma.user.findFirst({ where: { login } }),
    prisma.role.findUnique({ where: { slug: "parent" } }),
  ]);
  if (existingLogin) {
    throw new ConflictError(
      "Этот логин уже занят. Для существующего родителя используйте привязку по логину.",
      "LOGIN_ALREADY_EXISTS",
    );
  }
  if (!parentRole) {
    throw new BadRequestError("Роль родителя ещё не настроена");
  }

  const passwordHash = await bcrypt.hash(params.password, 10);
  const phone = normalizePhoneDigits(params.phone);
  const link = await prisma.$transaction(async (tx) => {
    const parent = await tx.user.create({
      data: {
        login,
        email: null,
        phone,
        phoneNormalized: phone,
        passwordHash,
        firstName: params.firstName.trim(),
        lastName: params.lastName.trim(),
        middleName: params.middleName?.trim() || null,
        roleId: parentRole.id,
        leagueEligible: false,
      },
      select: parentSelect,
    });
    const createdLink = await tx.parentStudentLink.create({
      data: {
        parentUserId: parent.id,
        studentUserId: params.studentId,
        relationship: params.relationship,
        createdById: params.actorId,
      },
      include: { parent: { select: parentSelect } },
    });
    return createdLink;
  });

  return parentLinkView(link);
}

export async function linkExistingParentToStudent(params: {
  studentId: string;
  actorId: string;
  login: string;
  relationship: FamilyRelationship;
}) {
  await assertStudent(params.studentId);
  const login = normalizeLogin(params.login);
  const parent = await prisma.user.findFirst({
    where: {
      login,
      role: { slug: "parent" },
      ...notDeleted,
      isActive: true,
    },
    select: { id: true },
  });
  if (!parent) {
    throw new NotFoundError("Родитель с таким логином не найден");
  }

  const link = await prisma.parentStudentLink.upsert({
    where: {
      parentUserId_studentUserId: {
        parentUserId: parent.id,
        studentUserId: params.studentId,
      },
    },
    create: {
      parentUserId: parent.id,
      studentUserId: params.studentId,
      relationship: params.relationship,
      createdById: params.actorId,
    },
    update: {
      relationship: params.relationship,
      isActive: true,
      revokedAt: null,
      createdById: params.actorId,
    },
    include: { parent: { select: parentSelect } },
  });

  return parentLinkView(link);
}

export async function revokeParentLink(params: {
  studentId: string;
  linkId: string;
}) {
  await assertStudent(params.studentId);
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      id: params.linkId,
      studentUserId: params.studentId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!link) throw new NotFoundError("Parent link");

  await prisma.parentStudentLink.update({
    where: { id: link.id },
    data: { isActive: false, revokedAt: new Date() },
  });
  return { revoked: true };
}

export async function resetLinkedParentPassword(params: {
  studentId: string;
  linkId: string;
  password: string;
}) {
  await assertStudent(params.studentId);
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      id: params.linkId,
      studentUserId: params.studentId,
      isActive: true,
      parent: {
        role: { slug: "parent" },
        ...notDeleted,
        isActive: true,
      },
    },
    select: { parentUserId: true },
  });
  if (!link) throw new NotFoundError("Parent link");

  await prisma.user.update({
    where: { id: link.parentUserId },
    data: { passwordHash: await bcrypt.hash(params.password, 10) },
  });
  return { updated: true };
}

export async function listParentChildren(parentUserId: string) {
  const links = await prisma.parentStudentLink.findMany({
    where: {
      parentUserId,
      isActive: true,
      student: {
        role: { slug: "student" },
        ...notDeleted,
        isActive: true,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return links.map((link) => ({
    id: link.student.id,
    firstName: link.student.firstName,
    lastName: link.student.lastName,
    middleName: link.student.middleName,
    fullName: formatFio(link.student),
    avatar: link.student.avatar,
    relationship: link.relationship,
  }));
}

async function assertParentChildLink(parentUserId: string, studentUserId: string) {
  const link = await prisma.parentStudentLink.findFirst({
    where: {
      parentUserId,
      studentUserId,
      isActive: true,
      parent: { role: { slug: "parent" }, ...notDeleted, isActive: true },
      student: { role: { slug: "student" }, ...notDeleted, isActive: true },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
        },
      },
    },
  });
  if (!link) throw new NotFoundError("Связь с учеником не найдена");
  return link;
}

export async function getParentChildOfflineSummary(
  parentUserId: string,
  studentUserId: string,
) {
  const link = await assertParentChildLink(parentUserId, studentUserId);
  const summary = buildFamilyOfflineSummary(
    await getStudentSchoolOfflineSummary(studentUserId),
  );
  return {
    child: {
      id: link.student.id,
      firstName: link.student.firstName,
      lastName: link.student.lastName,
      middleName: link.student.middleName,
      fullName: formatFio(link.student),
      avatar: link.student.avatar,
      relationship: link.relationship,
    },
    summary,
  };
}
