export function isContentAdminRole(roleSlug: string): boolean {
  return roleSlug === "admin" || roleSlug === "owner";
}
