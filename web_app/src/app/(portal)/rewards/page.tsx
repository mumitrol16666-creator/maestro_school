"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ScreenSkeleton } from "@/components/screen-skeleton";

/** Decision 24.10: Coins are not shown to students until the shop opens; the old link goes home. */
export default function RewardsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return <ScreenSkeleton variant="page" label="Открываем главную" />;
}
