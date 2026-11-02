"use client";

import { useEffect, useState } from "react";

type PlatformOs = "ios" | "android" | "other";

interface PlatformInfo {
  os: PlatformOs;
  /** iPad (including iPadOS that sends a desktop «Macintosh» UA): the Share button sits at the top. */
  ipad: boolean;
  /** iOS and the real Safari: only there «Поделиться → На экран «Домой»» installs the app. */
  iosSafari: boolean;
  /** Opened from the Home Screen icon / the installed app. */
  installed: boolean;
}

// Browsers on iOS that are not Safari: they cannot add the app to the Home Screen
// (or hide that in a menu), so the student is asked to open the page in Safari.
const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Brave|FBAN|FBAV|FB_IAB|Instagram|Line\/|MiuiBrowser|Telegram|WhatsApp|VKClient|; wv\)/i;

/**
 * The one place that tells the platform apart (document 20, В-40). Pure: the browser values
 * come in as arguments, so the rules are the same on the server, in the page and in a test.
 */
function detectPlatform(userAgent: string, maxTouchPoints = 0): Omit<PlatformInfo, "installed"> {
  const iphone = /iPhone|iPod/.test(userAgent);
  const ipadUa = /iPad/.test(userAgent);
  // iPadOS 13+ asks for the desktop site by default: «Macintosh» with a touch screen.
  const ipadDesktopUa = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (iphone || ipadUa || ipadDesktopUa) {
    return {
      os: "ios",
      ipad: ipadUa || ipadDesktopUa,
      iosSafari: /Safari\//.test(userAgent) && !IOS_OTHER_BROWSERS.test(userAgent),
    };
  }
  if (/Android/i.test(userAgent)) return { os: "android", ipad: false, iosSafari: false };
  return { os: "other", ipad: false, iosSafari: false };
}

export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneIos = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneIos || window.matchMedia("(display-mode: standalone)").matches;
}

function readPlatform(): PlatformInfo {
  return {
    ...detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    installed: isInstalledApp(),
  };
}

/** `null` until the page runs in the browser, so the server and the first paint agree. */
export function usePlatform(): PlatformInfo | null {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  useEffect(() => setPlatform(readPlatform()), []);
  return platform;
}
