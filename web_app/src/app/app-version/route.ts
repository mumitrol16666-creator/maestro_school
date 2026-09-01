import { NextResponse } from "next/server";
import { APP_CACHE_VERSION } from "@/lib/pwa-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: APP_CACHE_VERSION },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
