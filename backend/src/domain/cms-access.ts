export function isContentAdminRole(roleSlug: string): boolean {
  return ["admin", "owner", "super_admin"].includes(roleSlug);
}

export function isOfflineCoordinatorRole(roleSlug: string): boolean {
  return ["admin", "owner", "super_admin", "curator", "branch_manager"].includes(roleSlug);
}
