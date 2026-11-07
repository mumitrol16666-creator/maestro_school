"use client";

import { useSyncExternalStore } from "react";

// З-22: two cards at the bottom of the screen at once cover the page. The install hint goes
// first; the notification hint waits until it is closed, installed, or not needed at all.
let installPromptOpen = false;
const listeners = new Set<() => void>();

export function setInstallPromptOpen(open: boolean) {
  if (installPromptOpen === open) return;
  installPromptOpen = open;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useInstallPromptOpen() {
  return useSyncExternalStore(subscribe, () => installPromptOpen, () => false);
}
