import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { fetchTeacherStudents } from "../../infrastructure/crm/crm-client.js";

function phoneDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

async function requireCrmTeacherId(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId },
    select: { crmTeacherId: true },
  });
  if (!user?.crmTeacherId) {
    throw new BadRequestError(
      "Профиль преподавателя не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }
  return user.crmTeacherId;
}

export async function listTeacherStudents(appTeacherId: string) {
  const crmTeacherId = await requireCrmTeacherId(appTeacherId);
  const [crmRoster, onlineRequests] = await Promise.all([
    fetchTeacherStudents(crmTeacherId),
    prisma.onlineLessonRequest.findMany({
      where: { teacherId: appTeacherId, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        directionTitle: true,
        scheduledAt: true,
        completedAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            login: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
    }),
  ]);

  const onlineByStudent = new Map<string, typeof onlineRequests>();
  for (const request of onlineRequests) {
    const list = onlineByStudent.get(request.student.id) ?? [];
    list.push(request);
    onlineByStudent.set(request.student.id, list);
  }

  const merged = new Map<string, {
    key: string;
    appUserId: string | null;
    crmStudentId: string | null;
    firstName: string;
    lastName: string;
    middleName: string;
    name: string;
    dateOfBirth: string | null;
    phone: string;
    email: string | null;
    login: string | null;
    avatarUrl: string | null;
    learningLevel: string | null;
    accountBalance: number | null;
    externalLinkStatus: string | null;
    directions: string[];
    groups: Array<{ crmGroupId: string; name: string; direction: string; level: string }>;
    schedules: Array<{ id: string; dayOfWeek: number; time: string; duration: number }>;
    attendanceHistory: Array<{
      crmClassId: string;
      title: string;
      date: string;
      startTime: string;
      classStatus: string;
      attended: boolean;
      attendanceStatus: string;
      chargeAmount: number;
      chargeSource: string | null;
    }>;
    memberships: Array<{
      crmMembershipId: string;
      type: string;
      classesRemaining: number;
      endDate: string;
      group: { crmGroupId: string; name: string; direction: string } | null;
    }>;
    sources: Array<"offline" | "online">;
    onlineLessons: Array<{
      id: string;
      status: string;
      directionTitle: string;
      scheduledAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    }>;
  }>();

  for (const student of crmRoster.students) {
    const linkedOnline = student.appUserId ? onlineByStudent.get(student.appUserId) ?? [] : [];
    const key = student.appUserId || student.crmStudentId;
    merged.set(key, {
      key,
      appUserId: student.appUserId ?? null,
      crmStudentId: student.crmStudentId,
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName ?? "",
      name: student.name,
      dateOfBirth: student.dateOfBirth ?? null,
      phone: student.phone,
      email: linkedOnline[0]?.student.email ?? null,
      login: linkedOnline[0]?.student.login ?? null,
      avatarUrl: linkedOnline[0]?.student.avatar ?? student.avatarUrl ?? null,
      learningLevel: student.learningLevel ?? null,
      accountBalance: student.accountBalance,
      externalLinkStatus: student.externalLinkStatus ?? null,
      directions: [...new Set([
        ...student.directions,
        ...linkedOnline.map((request) => request.directionTitle),
      ])],
      groups: student.groups,
      schedules: student.schedules,
      attendanceHistory: student.attendanceHistory,
      memberships: student.memberships,
      sources: linkedOnline.length ? ["offline", "online"] : ["offline"],
      onlineLessons: linkedOnline.map(({ student: _student, ...request }) => request),
    });
  }

  for (const [studentId, requests] of onlineByStudent) {
    const student = requests[0].student;
    const existing = merged.get(studentId)
      ?? [...merged.values()].find((item) => phoneDigits(item.phone) === phoneDigits(student.phone));
    if (existing) {
      if (!existing.sources.includes("online")) existing.sources.push("online");
      existing.appUserId = student.id;
      existing.email = student.email;
      existing.login = student.login;
      existing.avatarUrl = student.avatar ?? existing.avatarUrl;
      existing.directions = [...new Set([
        ...existing.directions,
        ...requests.map((request) => request.directionTitle),
      ])];
      existing.onlineLessons = requests.map(({ student: _student, ...request }) => request);
      continue;
    }

    merged.set(studentId, {
      key: studentId,
      appUserId: student.id,
      crmStudentId: null,
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName ?? "",
      name: `${student.lastName} ${student.firstName} ${student.middleName || ""}`.trim(),
      dateOfBirth: null,
      phone: student.phone,
      email: student.email,
      login: student.login,
      avatarUrl: student.avatar,
      learningLevel: null,
      accountBalance: null,
      externalLinkStatus: null,
      directions: [...new Set(requests.map((request) => request.directionTitle))],
      groups: [],
      schedules: [],
      attendanceHistory: [],
      memberships: [],
      sources: ["online"],
      onlineLessons: requests.map(({ student: _student, ...request }) => request),
    });
  }

  return {
    teacher: crmRoster.teacher,
    students: [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, "ru")),
  };
}
