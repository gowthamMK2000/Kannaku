import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { isAdminRequest } from "@/lib/auth";

// GET /api/qr -> the current Baileys pairing QR as a data URL, for the
// banker's WhatsApp connection sheet ("scan from a laptop" flow).
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = global.__kanakku?.qr ?? null;
  if (!raw) {
    return NextResponse.json({ dataUrl: null });
  }

  const dataUrl = await QRCode.toDataURL(raw, { margin: 1, scale: 6 });
  return NextResponse.json({ dataUrl });
}
