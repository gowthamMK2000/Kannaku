import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { relinkWhatsApp } from "@/lib/server/whatsappControl";

// POST /api/whatsapp-reset — wipes the stored WhatsApp session and starts a
// fresh, unregistered connection. For when the linked device unlinked itself
// (or was force-logged-out) and the stored session is now permanently
// rejected — restarting alone won't fix that, since it keeps retrying the
// same stale creds. See lib/server/bot.js's clearSession/forceReconnect.
export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await relinkWhatsApp();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset the WhatsApp session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
