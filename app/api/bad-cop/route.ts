import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTripData } from "@/lib/data";
import { computeBalances } from "@/lib/balances";
import { inr } from "@/lib/format";
import { sendGroupMessage } from "@/lib/server/whatsapp";

// POST /api/bad-cop — Requirement C. Callable from the banker's dashboard
// button (admin cookie) or from a Railway cron job (X-Cron-Secret header),
// since a scheduled trigger has no browser cookie to present.
function isAuthorized(req: NextRequest, admin: boolean) {
  if (admin) return true;
  const provided = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  return !!expected && provided === expected;
}

export async function POST(req: NextRequest) {
  const admin = await isAdminRequest();
  if (!isAuthorized(req, admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { settings, users, expenses, deposits, payouts } = await getTripData();
  const { owed, unsettledTotal } = computeBalances(expenses, users, deposits, payouts);
  const debtors = users
    .filter((u) => (owed[u.id] ?? 0) > 0)
    .sort((a, b) => (owed[b.id] ?? 0) - (owed[a.id] ?? 0));

  if (debtors.length === 0) {
    return NextResponse.json({ sent: false, message: "Everyone is settled. The Bad Cop is off duty." });
  }

  const lines = debtors.map((u) => `${u.name} — ${inr(owed[u.id] ?? 0)}`);
  const text = [
    `*Pending dues — ${settings.trip_name}*`,
    "Please clear these today:",
    "",
    ...lines,
    "",
    `Total pending: ${inr(unsettledTotal)}`,
    settings.banker_upi_id ? `Pay the banker: ${settings.banker_upi_id}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendGroupMessage(text, settings.whatsapp_group_jid || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send the WhatsApp message.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const sb = supabaseAdmin();
  const sentAt = new Date().toISOString();
  await sb.from("trip_settings").update({ last_bad_cop_sent_at: sentAt }).eq("id", 1);

  return NextResponse.json({ sent: true, message: text, sentAt });
}
