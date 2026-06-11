import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { PwaProvider } from "@/components/pwa-provider";

export const metadata: Metadata = {
  title: "Maestro — кабинет ученика",
  description: "Образовательная платформа музыкальной школы Maestro",
  manifest: "/manifest.webmanifest",
  applicationName: "Maestro",
  appleWebApp: {
    capable: true,
    title: "Maestro",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#181816",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          {children}
          <PwaProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
