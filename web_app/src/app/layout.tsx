import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ClientRuntimeRecovery } from "@/components/client-runtime-recovery";
import { PwaProvider } from "@/components/pwa-provider";
import { APP_CACHE_VERSION } from "@/lib/pwa-version";

export const metadata: Metadata = {
  title: "Maestro — образовательная платформа",
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
      { url: "/icons/icon-192.png?v=student-purple-1", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=student-purple-1", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg?v=student-purple-1", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.png?v=student-purple-1", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#24134F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <meta name="maestro-release" content={APP_CACHE_VERSION} />
      </head>
      <body>
        <AuthProvider>
          {children}
          <ClientRuntimeRecovery />
          <PwaProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
