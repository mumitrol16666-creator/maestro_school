import { roleLabel } from "@/lib/role-labels";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-ink text-white",
  owner: "bg-stone-800 text-white",
  teacher: "bg-sky-100 text-sky-900",
  curator: "bg-violet-100 text-violet-900",
  branch_manager: "bg-orange-100 text-orange-900",
  student: "bg-amber-50 text-amber-900",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${ROLE_STYLES[role] ?? "bg-stone-100 text-stone-700"}`}>
      {roleLabel(role)}
    </span>
  );
}
