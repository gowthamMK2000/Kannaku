import { NextResponse } from "next/server";

// Requirement per Backend implications: GET /api/status -> bot connection state.
export async function GET() {
  const state = global.__kanakku;
  return NextResponse.json({
    state: state?.status ?? "disconnected",
    lastPingAt: state?.lastPingAt ?? null,
  });
}
