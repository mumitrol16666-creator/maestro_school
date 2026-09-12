"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LearningDialogMailbox } from "@/components/learning-dialog-mailbox";
import { LoadingState } from "@/components/data-states";

export default function FamilyMessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const enabled = Boolean(user?.productFeatures?.learningDialogsV2);

  useEffect(() => {
    if (!loading && !enabled) router.replace("/family");
  }, [enabled, loading, router]);

  if (loading || !enabled) return <LoadingState label="Открываем семейный кабинет" />;
  return <LearningDialogMailbox role="parent" />;
}
