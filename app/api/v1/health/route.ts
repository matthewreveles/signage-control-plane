import { NextResponse } from "next/server";

import { getScreenNetworkReadiness } from "@/lib/screen-network-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getScreenNetworkReadiness();

  return NextResponse.json(
    {
      service: "gspan-screen-network",
      ...readiness,
      checkedAt: new Date().toISOString(),
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
