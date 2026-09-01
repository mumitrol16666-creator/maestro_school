import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

export const metadata: Metadata = {
  title: "Maestro — кабинет ученика",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>;
}
