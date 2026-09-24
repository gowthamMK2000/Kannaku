import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { Deposit, Expense, Payout, TripData, TripSettings, TripUser } from "@/types";

export { computeBalances } from "./balances";
export type { Balances } from "./balances";

const DEFAULT_SETTINGS: TripSettings = {
  id: 1,
  trip_name: "Our Trip",
  trip_dates: null,
  banker_upi_id: null,
  whatsapp_group_jid: null,
  last_bad_cop_sent_at: null,
};

export async function getTripData(): Promise<TripData> {
  const sb = supabaseAdmin();

  const [settingsRes, usersRes, expensesRes, depositsRes, payoutsRes] = await Promise.all([
    sb.from("trip_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("trip_users").select("*").order("sort_order", { ascending: true }),
    sb
      .from("expenses")
      .select("*, splits:expense_splits(*)")
      .order("occurred_at", { ascending: false }),
    sb.from("deposits").select("*").order("deposited_at", { ascending: false }),
    sb.from("payouts").select("*").order("paid_at", { ascending: false }),
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (usersRes.error) throw usersRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (depositsRes.error) throw depositsRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  const settings = (settingsRes.data as TripSettings | null) ?? DEFAULT_SETTINGS;

  return {
    // WHATSAPP_GROUP_JID can be configured via env var instead of the Trip
    // setup form (that's how linking is typically set up first) — if the DB
    // column is empty, show/use that env value rather than a blank field, so
    // it doesn't look unset and so saving unrelated settings doesn't
    // re-submit an empty JID and overwrite it with null.
    settings: { ...settings, whatsapp_group_jid: settings.whatsapp_group_jid || process.env.WHATSAPP_GROUP_JID || null },
    users: (usersRes.data as TripUser[]) ?? [],
    expenses: (expensesRes.data as Expense[]) ?? [],
    deposits: (depositsRes.data as Deposit[]) ?? [],
    payouts: (payoutsRes.data as Payout[]) ?? [],
  };
}
