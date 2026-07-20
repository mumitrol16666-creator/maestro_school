export function isContentAdminRole(roleSlug: string): boolean {
  return roleSlug === "admin" || roleSlug === "owner";
}

export function isOfflineCoordinatorRole(roleSlug: string): boolean {
  return ["admin", "owner", "curator", "branch_manager"].includes(roleSlug);
}
