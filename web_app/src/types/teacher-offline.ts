export type TeacherOfflineClass = {
  crmClassId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  duration?: number;
  status: string;
  classType?: string;
  group?: { crmGroupId: string; name: string } | null;
  teacher?: { crmTeacherId: string; name: string } | null;
  room?: { crmRoomId: string; name: string } | null;
  topic?: string | null;
  homeworkDraft?: string | null;
  teacherComment?: string | null;
  teacherOutcomeHint?: string | null;
};

export type TeacherOfflineAgenda = {
  crmTeacherId: string;
  from: string;
  to: string;
  classes: TeacherOfflineClass[];
};

export type TeacherOfflineStudent = {
  crmStudentId: string;
  appUserId?: string | null;
  name: string;
  phone?: string;
  attended: boolean | null;
  markedAt?: string | null;
  groupStatus?: string;
};

export type TeacherOfflineClassStudents = {
  crmClassId: string;
  group: { crmGroupId: string; name: string } | null;
  students: TeacherOfflineStudent[];
};
