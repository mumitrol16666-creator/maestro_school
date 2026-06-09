import { AdminGuard } from "@/components/admin-guard";
import { AdminShell } from "@/components/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard><AdminShell>{children}</AdminShell></AdminGuard>;
}
