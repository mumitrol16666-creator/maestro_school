import { ParentGuard } from "@/components/parent-guard";
import { ParentShell } from "@/components/parent-shell";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentGuard>
      <ParentShell>{children}</ParentShell>
    </ParentGuard>
  );
}
