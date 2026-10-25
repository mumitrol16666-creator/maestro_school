"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingState } from "@/components/data-states";

/** Decision 24.10: Coins are not shown to students until the shop opens; the old link goes home. */
export default function RewardsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return <LoadingState label="Открываем главную" />;
}
