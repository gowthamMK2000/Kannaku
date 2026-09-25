import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTripData } from "@/lib/data";
import { computeBalances } from "@/lib/balances";
import { inr } from "@/lib/format";
import { sendGroupMessage } from "@/lib/server/whatsapp";
import type { TripSettings } from "@/types";

// A fixed, not-persisted assumption for how much each person is expected to
// chip in before the trip — only used for the "advance" message's "pending
// to collect" line. Bump this by hand if the target ever changes; it's
// intentionally not a saved setting (see conversation history).
const ADVANCE_GOAL_PER_HEAD = 3500;

// POST /api/bad-cop — Requirement C. Callable from the banker's dashboard
// button (admin cookie) or from a Railway cron job (X-Cron-Secret header),
// since a scheduled trigger has no browser cookie to present.
function isAuthorized(req: NextRequest, admin: boolean) {
  if (admin) return true;
  const provided = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  return !!expected && provided === expected;
}

function header(settings: TripSettings, emoji: string, label: string) {
  return `${emoji} *${label} — ${settings.trip_name}${settings.trip_dates ? ` (${settings.trip_dates})` : ""}*`;
}

function poolLine(pool: number) {
  return pool >= 0 ? `Pool left: ${inr(pool)}` : `Pool is ${inr(Math.abs(pool))} short`;
}

export async function POST(req: NextRequest) {
  const admin = await isAdminRequest();
  if (!isAuthorized(req, admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const mode: "quick" | "final" = body?.mode === "quick" ? "quick" : "final";

  const { settings, users, expenses, deposits, payouts } = await getTripData();
  const { owed, deposited, unsettledTotal, spent, pool, depositedTotal } = computeBalances(expenses, users, deposits, payouts);

  let text: string;

  if (expenses.length === 0) {
    // Nothing spent yet — this is a fund-check, not a debt nudge.
    const contributors = users
      .filter((u) => (deposited[u.id] ?? 0) > 0)
      .sort((a, b) => (deposited[b.id] ?? 0) - (deposited[a.id] ?? 0));
    const goal = ADVANCE_GOAL_PER_HEAD * users.length;
    const pending = Math.max(0, goal - depositedTotal);

    if (contributors.length === 0) {
      return NextResponse.json({ sent: false, message: "Nobody's paid in yet — nothing to announce." });
    }

    const lines = contributors.map((u) => `${u.name} — ${inr(deposited[u.id] ?? 0)}`);
    text = [
      header(settings, "📋", "Trip fund check"),
      "Everyone's chipping in! Here's who's paid in advance:",
      "",
      ...lines,
      "",
      `Total collected: ${inr(depositedTotal)}`,
      pending > 0 ? `Pending to collect: ${inr(pending)}` : null,
      "",
      pending > 0 ? `We're ${inr(pending)} away from the dream. Manifest it via UPI 🙏` : "Fully funded! The dream is real 🎉",
    ]
      .filter((line) => line !== null)
      .join("\n");
  } else if (mode === "quick") {
    // Just a spend/pool snapshot — no per-person nudging.
    text = [header(settings, "📋", "Trip update"), `Total spent so far: ${inr(spent)}`, poolLine(pool), "", "Onward! 🚀"].join("\n");
  } else {
    const debtors = users
      .filter((u) => (owed[u.id] ?? 0) > 0)
      .sort((a, b) => (owed[b.id] ?? 0) - (owed[a.id] ?? 0));

    if (debtors.length === 0) {
      return NextResponse.json({ sent: false, message: "Everyone is settled. The Bad Cop is off duty." });
    }

    const lines = debtors.map((u) => `${u.name} — ${inr(owed[u.id] ?? 0)}`);
    const totalLine = `Total: ${inr(unsettledTotal)}${settings.banker_upi_id ? ` → ${settings.banker_upi_id}` : ""}`;
    // `.filter((line) => line !== null)`, not `.filter(Boolean)` — the blank
    // strings below are intentional spacer lines, and Boolean("") is false,
    // so the old filter was silently collapsing every one of them.
    text = [
      header(settings, "📋", "Trip tally"),
      `Spent: ${inr(spent)} · ${poolLine(pool)}`,
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
  }

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
