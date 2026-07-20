import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { fetchStudentTeachers, fetchTeacherStudents } from "../../infrastructure/crm/crm-client.js";
import { sendPushToUser } from "./push-notification.service.js";

type MailboxRole = "student" | "teacher";
type ContactSource = "offline" | "online";

function personName(person: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ").trim();
}

function ensureMailboxRole(role: string): asserts role is MailboxRole {
  if (role !== "student" && role !== "teacher") {
    throw new ForbiddenError("Переписка доступна ученикам и преподавателям");
  }
}

async function listStudentContacts(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { crmStudentId: true },
  });
  if (!student) throw new NotFoundError("User");

  const contacts = new Map<string, {
    id: string;
    directions: Set<string>;
    sources: Set<ContactSource>;
  }>();

  if (student.crmStudentId) {
    const crm = await fetchStudentTeachers(student.crmStudentId).catch(() => ({ teachers: [] }));
    for (const teacher of crm.teachers) {
      if (!teacher.appUserId) continue;
      contacts.set(teacher.appUserId, {
        id: teacher.appUserId,
        directions: new Set(teacher.directions),
        sources: new Set(["offline"]),
      });
    }
  }

  const onlineLessons = await prisma.onlineLessonRequest.findMany({
    where: {
      studentId,
      teacherId: { not: null },
      status: { not: "cancelled" },
    },
    select: { teacherId: true, directionTitle: true },
  });
  for (const lesson of onlineLessons) {
    if (!lesson.teacherId) continue;
    const current = contacts.get(lesson.teacherId) ?? {
      id: lesson.teacherId,
      directions: new Set<string>(),
      sources: new Set<ContactSource>(),
    };
    current.directions.add(lesson.directionTitle);
    current.sources.add("online");
    contacts.set(lesson.teacherId, current);
  }

  if (!contacts.size) return [];

  const [teachers, conversations] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: [...contacts.keys()] },
        isActive: true,
        deletedAt: null,
        role: { slug: "teacher" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatar: true,
      },
    }),
    prisma.teacherConversation.findMany({
      where: { studentId, teacherId: { in: [...contacts.keys()] } },
      select: { id: true, teacherId: true },
    }),
  ]);
  const conversationByTeacher = new Map(conversations.map((item) => [item.teacherId, item.id]));

  return teachers
    .map((teacher) => {
      const relation = contacts.get(teacher.id)!;
      return {
        id: teacher.id,
        name: personName(teacher),
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        middleName: teacher.middleName,
        avatar: teacher.avatar,
        directions: [...relation.directions],
        sources: [...relation.sources],
        conversationId: conversationByTeacher.get(teacher.id) ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

async function listTeacherContacts(teacherId: string) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { crmTeacherId: true },
  });
  if (!teacher) throw new NotFoundError("User");

  const [crmRoster, onlineLessons] = await Promise.all([
    teacher.crmTeacherId
      ? fetchTeacherStudents(teacher.crmTeacherId).catch(() => null)
      : Promise.resolve(null),
    prisma.onlineLessonRequest.findMany({
      where: {
        teacherId,
        status: { not: "cancelled" },
      },
      select: {
        directionTitle: true,
        studentId: true,
      },
    }),
  ]);
  const relations = new Map<string, {
    directions: Set<string>;
    sources: Set<ContactSource>;
  }>();
  for (const student of crmRoster?.students ?? []) {
    if (!student.appUserId) continue;
    relations.set(student.appUserId, {
      directions: new Set(student.directions),
      sources: new Set(["offline"]),
    });
  }
  for (const lesson of onlineLessons) {
    const current = relations.get(lesson.studentId) ?? {
      directions: new Set<string>(),
      sources: new Set<ContactSource>(),
    };
    current.directions.add(lesson.directionTitle);
    current.sources.add("online");
    relations.set(lesson.studentId, current);
  }

  const studentIds = [...relations.keys()];
  if (!studentIds.length) return [];

  const [students, conversations] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: studentIds },
        isActive: true,
        deletedAt: null,
        role: { slug: "student" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatar: true,
      },
    }),
    prisma.teacherConversation.findMany({
      where: { teacherId, studentId: { in: studentIds } },
      select: { id: true, studentId: true },
    }),
  ]);
  const conversationByStudent = new Map(conversations.map((item) => [item.studentId, item.id]));

  return students
    .map((student) => {
      const relation = relations.get(student.id)!;
      return {
        id: student.id,
        name: personName(student),
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        avatar: student.avatar,
        directions: [...relation.directions],
        sources: [...relation.sources],
        conversationId: conversationByStudent.get(student.id) ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export async function listMessageContacts(userId: string, role: string) {
  ensureMailboxRole(role);
  return role === "student"
    ? listStudentContacts(userId)
    : listTeacherContacts(userId);
}

export async function listConversations(userId: string, role: string) {
  ensureMailboxRole(role);
  const conversations = await prisma.teacherConversation.findMany({
    where: role === "student" ? { studentId: userId } : { teacherId: userId },
    orderBy: { lastMessageAt: "desc" },
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
      teacher: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatar: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          senderId: true,
          body: true,
          readAt: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: {
            where: { senderId: { not: userId }, readAt: null },
          },
        },
      },
    },
  });

  return conversations.map((conversation) => {
    const counterpart = role === "student" ? conversation.teacher : conversation.student;
    return {
      id: conversation.id,
      counterpart: {
        ...counterpart,
        name: personName(counterpart),
      },
      lastMessage: conversation.messages[0] ?? null,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: conversation._count.messages,
    };
  });
}

async function requireConversation(userId: string, conversationId: string) {
  const conversation = await prisma.teacherConversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ studentId: userId }, { teacherId: userId }],
    },
    include: {
      student: {
        select: { id: true, firstName: true, lastName: true, middleName: true, avatar: true },
      },
      teacher: {
        select: { id: true, firstName: true, lastName: true, middleName: true, avatar: true },
      },
    },
  });
  if (!conversation) throw new NotFoundError("Conversation");
  return conversation;
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await requireConversation(userId, conversationId);
  const now = new Date();
  const notificationUrl = conversation.teacherId === userId
    ? `/admin/messages?conversation=${conversation.id}`
    : `/messages?conversation=${conversation.id}`;

  const [messages] = await prisma.$transaction([
    prisma.teacherMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        senderId: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.teacherMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: now },
    }),
    prisma.userNotification.updateMany({
      where: {
        userId,
        type: "direct_message_received",
        url: notificationUrl,
        readAt: null,
      },
      data: { readAt: now },
    }),
  ]);

  const counterpart = conversation.studentId === userId
    ? conversation.teacher
    : conversation.student;
  return {
    id: conversation.id,
    counterpart: { ...counterpart, name: personName(counterpart) },
    messages: messages.map((message) => ({
      ...message,
      mine: message.senderId === userId,
    })),
  };
}

async function assertCanMessage(userId: string, role: MailboxRole, recipientId: string) {
  const contacts = role === "student"
    ? await listStudentContacts(userId)
    : await listTeacherContacts(userId);
  if (!contacts.some((contact) => contact.id === recipientId)) {
    throw new ForbiddenError(
      role === "student"
        ? "Обращение можно отправить только вашему преподавателю"
        : "Сообщение можно отправить только назначенному вам ученику",
    );
  }
}

async function deliverMessage(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  body: string;
  recipientRole: MailboxRole;
}) {
  const url = params.recipientRole === "teacher"
    ? `/admin/messages?conversation=${params.conversationId}`
    : `/messages?conversation=${params.conversationId}`;
  const preview = params.body.length > 180 ? `${params.body.slice(0, 177)}...` : params.body;

  const [message] = await prisma.$transaction([
    prisma.teacherMessage.create({
      data: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        body: params.body,
      },
      select: {
        id: true,
        senderId: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.teacherConversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: new Date() },
    }),
    prisma.userNotification.create({
      data: {
        userId: params.recipientId,
        type: "direct_message_received",
        title: `Новое сообщение от ${params.senderName}`,
        body: preview,
        url,
      },
    }),
  ]);

  await sendPushToUser(params.recipientId, {
    title: `Новое сообщение от ${params.senderName}`,
    body: preview,
    url,
    tag: `direct-message-${params.conversationId}`,
  }).catch(() => undefined);

  return { ...message, mine: true };
}

export async function startConversation(params: {
  userId: string;
  role: string;
  recipientId: string;
  body: string;
}) {
  ensureMailboxRole(params.role);
  const body = params.body.trim();
  if (!body) throw new BadRequestError("Напишите сообщение");
  await assertCanMessage(params.userId, params.role, params.recipientId);

  const studentId = params.role === "student" ? params.userId : params.recipientId;
  const teacherId = params.role === "teacher" ? params.userId : params.recipientId;
  const [sender, conversation] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { firstName: true, lastName: true, middleName: true },
    }),
    prisma.teacherConversation.upsert({
      where: { studentId_teacherId: { studentId, teacherId } },
      create: { studentId, teacherId },
      update: {},
      select: { id: true },
    }),
  ]);

  const message = await deliverMessage({
    conversationId: conversation.id,
    senderId: params.userId,
    recipientId: params.recipientId,
    senderName: personName(sender),
    body,
    recipientRole: params.role === "student" ? "teacher" : "student",
  });
  return { conversationId: conversation.id, message };
}

export async function replyToConversation(params: {
  userId: string;
  role: string;
  conversationId: string;
  body: string;
}) {
  ensureMailboxRole(params.role);
  const body = params.body.trim();
  if (!body) throw new BadRequestError("Напишите сообщение");
  const conversation = await requireConversation(params.userId, params.conversationId);
  const recipientId = conversation.studentId === params.userId
    ? conversation.teacherId
    : conversation.studentId;
  await assertCanMessage(params.userId, params.role, recipientId);
  const sender = await prisma.user.findUniqueOrThrow({
    where: { id: params.userId },
    select: { firstName: true, lastName: true, middleName: true },
  });

  return deliverMessage({
    conversationId: conversation.id,
    senderId: params.userId,
    recipientId,
    senderName: personName(sender),
    body,
    recipientRole: params.role === "student" ? "teacher" : "student",
  });
}

export async function countUnreadMessages(userId: string, role: string) {
  ensureMailboxRole(role);
  return prisma.teacherMessage.count({
    where: {
      conversation: role === "student" ? { studentId: userId } : { teacherId: userId },
      senderId: { not: userId },
      readAt: null,
    },
  });
}
