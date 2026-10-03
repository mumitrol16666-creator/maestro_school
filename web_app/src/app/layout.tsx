import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { ClientRuntimeRecovery } from "@/components/client-runtime-recovery";
import { PwaProvider } from "@/components/pwa-provider";
import { APP_CACHE_VERSION } from "@/lib/pwa-version";

const inter = localFont({
  src: "../fonts/Inter.woff2", variable: "--font-inter", display: "swap", weight: "100 900",
});
const playfair = localFont({
  src: "../fonts/PlayfairDisplay.woff2", variable: "--font-playfair", display: "swap", weight: "400 900",
});

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
      { url: "/brand/guitar-avatar.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/guitar-avatar.png", sizes: "512x512", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} ${playfair.variable}`}>
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
