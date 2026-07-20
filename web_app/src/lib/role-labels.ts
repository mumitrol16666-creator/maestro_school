const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  super_admin: "Супер-админ",
  owner: "Владелец школы",
  teacher: "Преподаватель",
  curator: "Куратор",
  branch_manager: "Менеджер филиала",
  student: "Ученик",
};

const PERMISSION_LABELS: Record<string, string> = {
  "directions.read": "Направления школы",
  "courses.read": "Курсы и учебные материалы",
  "lessons.read": "Содержание уроков",
  "progress.read": "Прогресс учеников",
  "progress.write": "Отметки о прохождении уроков",
  "homework.submit": "Отправка домашних заданий",
  "homework.review": "Проверка домашних заданий",
  "news.read": "Доска Maestro",
  "news.manage": "Публикации на доске Maestro",
  "points.read": "Баллы за обучение",
  "catalog.manage": "Настройка курсов и материалов",
  "users.manage": "Пользователи и роли",
  "online_lessons.read": "Онлайн-уроки",
  "online_lessons.request": "Запись на онлайн-уроки",
  "online_lessons.manage": "Расписание онлайн-уроков",
  "coins.read": "Баланс Maestro Coins",
  "coins.award": "Начисление Maestro Coins",
  "offline_school.read": "Расписание школы",
  "offline_school.write": "Посещаемость и отчёты по урокам",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Видит все разделы и управляет настройками школы.",
  admin: "Работает с учениками, расписанием, уроками и учебными материалами.",
  branch_manager: "Организует ежедневную работу филиала и контролирует уроки.",
  curator: "Следит за учениками, домашними заданиями и обратной связью.",
  teacher: "Видит своих учеников, проводит уроки и заполняет отчёты.",
  student: "Видит своё расписание, материалы, задания и результаты.",
  super_admin: "Полный доступ ко всем разделам школы.",
};

export const ASSIGNABLE_ROLES = [
  "student",
  "teacher",
  "curator",
  "branch_manager",
  "admin",
  "owner",
] as const;

const STAFF_ROLES = ["admin", "owner", "teacher", "curator", "branch_manager", "super_admin"] as const;
const CONTENT_ADMIN_ROLES = ["admin", "owner"] as const;

export function roleLabel(role?: string | null) {
  if (!role) return "Пользователь";
  return ROLE_LABELS[role] ?? role;
}

export function permissionLabel(code: string) {
  return PERMISSION_LABELS[code] ?? code;
}

export function roleDescription(role?: string | null) {
  if (!role) return "Доступ определяется назначенной ролью.";
  return ROLE_DESCRIPTIONS[role] ?? "Доступ определяется назначенной ролью.";
}

export function isStudentRole(role?: string | null) {
  return role === "student";
}

export function isStaffRole(role?: string | null) {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isContentAdminRole(role?: string | null) {
  return !!role && (CONTENT_ADMIN_ROLES as readonly string[]).includes(role);
}

export function isOfflineCoordinatorRole(role?: string | null) {
  return !!role && ["admin", "owner", "curator", "branch_manager"].includes(role);
}

export function settingsPathForRole(role?: string | null) {
  return isStudentRole(role) ? "/settings" : "/admin/settings";
}
