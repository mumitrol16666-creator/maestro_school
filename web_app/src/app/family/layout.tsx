import type { Metadata } from "next";
import { ParentGuard } from "@/components/parent-guard";
import { ParentShell } from "@/components/parent-shell";

export const metadata: Metadata = {
  title: "Maestro — семейный кабинет",
};

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentGuard>
      <ParentShell>{children}</ParentShell>
    </ParentGuard>
  );
}
