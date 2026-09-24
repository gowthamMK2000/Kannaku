import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";

// POST /api/pairing-code -> ask Baileys for a fresh pairing code for the
// banker's own WhatsApp number ("Link with phone number instead" flow),
// since the banker can't scan a QR shown on their own screen.
export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const phoneNumber = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "Set ADMIN_WHATSAPP_NUMBER (the banker's WhatsApp number, digits only) to use pairing codes." },
      { status: 400 }
    );
  }

  const requestPairingCode = global.__kanakku?.requestPairingCode;
  if (!requestPairingCode) {
    return NextResponse.json({ error: "WhatsApp bot is not ready yet." }, { status: 503 });
  }

  try {
    const code = await requestPairingCode(phoneNumber);
    return NextResponse.json({ code });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to request a pairing code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
