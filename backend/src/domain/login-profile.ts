export type LoginProfile = "student" | "parent" | "staff";

export function roleMatchesLoginProfile(
  roleSlug: string,
  profile?: LoginProfile,
) {
  if (!profile) return true;
  if (profile === "student") return roleSlug === "student";
  if (profile === "parent") return roleSlug === "parent";
  return !["student", "parent"].includes(roleSlug);
}

export function filterLoginCandidatesByProfile<
  T extends { role: { slug: string } },
>(candidates: T[], profile?: LoginProfile) {
  return candidates.filter((candidate) =>
    roleMatchesLoginProfile(candidate.role.slug, profile));
}
