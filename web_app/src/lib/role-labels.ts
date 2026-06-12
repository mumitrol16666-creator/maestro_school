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
  "directions.read": "Просмотр направлений",
  "courses.read": "Просмотр курсов",
  "lessons.read": "Просмотр уроков",
  "progress.read": "Просмотр прогресса учеников",
  "progress.write": "Прохождение уроков",
  "homework.submit": "Отправка домашних заданий",
  "homework.review": "Проверка домашних заданий",
  "news.read": "Просмотр доски Maestro",
  "news.manage": "Публикация на доске",
  "points.read": "Просмотр баллов",
  "catalog.manage": "Управление каталогом (CMS)",
  "users.manage": "Управление учениками",
  "online_lessons.read": "Просмотр онлайн-уроков",
  "online_lessons.request": "Запись на онлайн-урок",
  "online_lessons.manage": "Управление онлайн-уроками",
  "coins.read": "Просмотр Maestro Coins",
  "coins.award": "Начисление Maestro Coins",
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

export function isStudentRole(role?: string | null) {
  return role === "student";
}

export function isStaffRole(role?: string | null) {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isContentAdminRole(role?: string | null) {
  return !!role && (CONTENT_ADMIN_ROLES as readonly string[]).includes(role);
}

export function settingsPathForRole(role?: string | null) {
  return isStudentRole(role) ? "/settings" : "/admin/settings";
}
