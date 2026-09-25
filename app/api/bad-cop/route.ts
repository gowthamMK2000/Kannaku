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
  const { owed, unsettledTotal, spent, pool } = computeBalances(expenses, users, deposits, payouts);
  const debtors = users
    .filter((u) => (owed[u.id] ?? 0) > 0)
    .sort((a, b) => (owed[b.id] ?? 0) - (owed[a.id] ?? 0));

  if (debtors.length === 0) {
    return NextResponse.json({ sent: false, message: "Everyone is settled. The Bad Cop is off duty." });
  }

  const lines = debtors.map((u) => `${u.name} — ${inr(owed[u.id] ?? 0)}`);
  const poolLine = pool >= 0 ? `Pool left: ${inr(pool)}` : `Pool is ${inr(Math.abs(pool))} short`;
  const totalLine = `Total: ${inr(unsettledTotal)}${settings.banker_upi_id ? ` → ${settings.banker_upi_id}` : ""}`;
  // `.filter((line) => line !== null)`, not `.filter(Boolean)` — the blank
  // strings below are intentional spacer lines, and Boolean("") is false,
  // so the old filter was silently collapsing every one of them.
  const text = [
    `📋 *Trip tally — ${settings.trip_name}${settings.trip_dates ? ` (${settings.trip_dates})` : ""}*`,
    `Spent: ${inr(spent)} · ${poolLine}`,
    "",
    "A gentle heads-up for:",
    ...lines,
    "",
    totalLine,
    "",
    "Settle up so the pool doesn't cry 💸",
  ]
    .filter((line) => line !== null)
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
