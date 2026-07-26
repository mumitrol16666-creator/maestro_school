export type PhoneAccountCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  crmStudentId?: string | null;
  role: { slug: string };
};

export function classifyPhoneLoginCandidates<T>(candidates: T[]) {
  if (candidates.length === 0) return { kind: "missing" as const };
  if (candidates.length === 1) return { kind: "single" as const, user: candidates[0] };
  return { kind: "ambiguous" as const, count: candidates.length };
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

export function selectProvisionCandidate<T extends PhoneAccountCandidate>(
  candidates: T[],
  identity: { firstName: string; lastName: string },
) {
  const matches = candidates.filter((candidate) => (
    candidate.role.slug === "student"
    && !candidate.crmStudentId
    && normalizeName(candidate.firstName) === normalizeName(identity.firstName)
    && normalizeName(candidate.lastName) === normalizeName(identity.lastName)
  ));

  if (matches.length === 0) return { kind: "create" as const };
  if (matches.length === 1) return { kind: "reuse" as const, user: matches[0] };
  return { kind: "ambiguous" as const, count: matches.length };
}
