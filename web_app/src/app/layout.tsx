import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Maestro — кабинет ученика",
  description: "Образовательная платформа музыкальной школы Maestro",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
