/**
 * TEMPORARY. Echoes back only the caller's own Vercel edge geo headers, to
 * confirm this project actually receives `x-vercel-ip-country-region` in
 * production (dev has no edge headers, so it can't be verified locally).
 *
 * Returns nothing about any other user and touches no data. Delete once the
 * launch-location feature is confirmed working.
 */

import { NextResponse } from "next/server";

import { detectLocation } from "@/lib/request-geo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const geoHeaders = Object.fromEntries(
    [...request.headers.entries()].filter(([name]) => name.startsWith("x-vercel-ip-")),
  );

  return NextResponse.json({
    rawGeoHeaders: geoHeaders,
    resolved: await detectLocation(),
  });
}
