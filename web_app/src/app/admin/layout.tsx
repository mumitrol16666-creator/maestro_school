import type { Metadata } from "next";
import { AdminGuard } from "@/components/admin-guard";
import { AdminShell } from "@/components/admin-shell";

export const metadata: Metadata = {
  title: "Maestro — рабочий кабинет",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard><AdminShell>{children}</AdminShell></AdminGuard>;
}
