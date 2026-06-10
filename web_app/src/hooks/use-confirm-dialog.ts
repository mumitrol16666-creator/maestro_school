"use client";

import { useState } from "react";
import type { ConfirmRequest } from "@/components/admin-feedback";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  action: () => Promise<void>;
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  function open(options: ConfirmOptions) {
    setRequest({
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel,
      onConfirm: async () => {
        setBusy(true);
        try {
          await options.action();
          setRequest(null);
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return {
    request,
    busy,
    open,
    close: () => { if (!busy) setRequest(null); },
  };
}
