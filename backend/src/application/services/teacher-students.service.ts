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
      // Keep cancelled requests in the teacher's student history. They are not
      // active work, but removing them makes the admin/app histories disagree.
      where: { teacherId: appTeacherId },
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
      externalLinkStatus: student.externalLinkStatus ?? null,
      directions: [...new Set([
        ...student.directions,
        ...linkedOnline.map((request) => request.directionTitle),
      ])],
      groups: student.groups,
      schedules: student.schedules,
      attendanceHistory: student.attendanceHistory.map((item) => ({
        crmClassId: item.crmClassId,
        title: item.title,
        date: item.date,
        startTime: item.startTime,
        classStatus: item.classStatus,
        attended: item.attended,
        attendanceStatus: item.attendanceStatus,
      })),
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
      externalLinkStatus: null,
      directions: [...new Set(requests.map((request) => request.directionTitle))],
      groups: [],
      schedules: [],
      attendanceHistory: [],
      sources: ["online"],
      onlineLessons: requests.map(({ student: _student, ...request }) => request),
    });
  }

  const students = [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, "ru"));
  const crmStudentIds = students
    .map((student) => student.crmStudentId)
    .filter((studentId): studentId is string => Boolean(studentId));
  const month = new Date().toISOString().slice(0, 7);
  const [checks, plans] = crmStudentIds.length
    ? await Promise.all([
        prisma.offlineLessonStudentCheck.findMany({
          where: { teacherUserId: appTeacherId, crmStudentId: { in: crmStudentIds } },
          orderBy: { markedAt: "desc" },
        }),
        prisma.studentMonthlyPlan.findMany({
          where: { teacherUserId: appTeacherId, crmStudentId: { in: crmStudentIds }, month },
        }),
      ])
    : [[], []];
  const checksByStudent = new Map<string, typeof checks>();
  for (const check of checks) {
    const list = checksByStudent.get(check.crmStudentId) ?? [];
    list.push(check);
    checksByStudent.set(check.crmStudentId, list);
  }
  const plansByStudent = new Map(plans.map((plan) => [plan.crmStudentId, plan]));

  return {
    teacher: crmRoster.teacher,
    students: students.map((student) => {
      const studentChecks = student.crmStudentId ? checksByStudent.get(student.crmStudentId) ?? [] : [];
      const plan = student.crmStudentId ? plansByStudent.get(student.crmStudentId) : null;
      const recentAttendance = student.attendanceHistory.slice(0, 8);
      const attendedCount = recentAttendance.filter((item) => ["present", "late"].includes(item.attendanceStatus)).length;
      const reviewedHomework = studentChecks.filter((item) => item.homeworkStatus !== "not_checked").slice(0, 8);
      const completedHomework = reviewedHomework.filter((item) => item.homeworkStatus === "completed").length;
      const planItems = Array.isArray(plan?.items)
        ? plan.items as Array<{ status?: string }>
        : [];
      const completedPlanItems = planItems.filter((item) => item.status === "completed").length;
      const signals: Array<{ code: string; title: string; action: string; tone: "warning" | "danger" }> = [];
      const recentAbsences = recentAttendance.slice(0, 3)
        .filter((item) => !["present", "late"].includes(item.attendanceStatus)).length;
      const recentMissedHomework = reviewedHomework.slice(0, 3)
        .filter((item) => item.homeworkStatus === "not_completed").length;

      if (student.crmStudentId && !plan) {
        signals.push({
          code: "monthly_plan_missing",
          title: "Нет учебного плана на текущий месяц",
          action: "Составьте месячный план",
          tone: "warning",
        });
      }
      if (recentAbsences >= 2) {
        signals.push({
          code: "attendance_decline",
          title: "Частые пропуски: два или больше из трёх последних уроков",
          action: "Скорректируйте темп и план повторения",
          tone: "danger",
        });
      }
      if (recentMissedHomework >= 2) {
        signals.push({
          code: "homework_decline",
          title: "Домашнее задание не выполнено несколько раз",
          action: "Упростите ДЗ и разберите причину на уроке",
          tone: "warning",
        });
      }

      return {
        ...student,
        learningSummary: {
          attendanceRate: recentAttendance.length
            ? Math.round((attendedCount / recentAttendance.length) * 100)
            : null,
          homeworkCompletionRate: reviewedHomework.length
            ? Math.round((completedHomework / reviewedHomework.length) * 100)
            : null,
          planCompletionRate: planItems.length
            ? Math.round((completedPlanItems / planItems.length) * 100)
            : null,
          currentMonth: month,
        },
        attentionSignals: signals,
      };
    }),
  };
}
