"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminRequest, ADMIN_COOKIE } from "@/lib/auth";
import { computeSplits, hasNegativeShare, splitsSumMatches } from "@/lib/splits";
import type { Category, SplitMethod } from "@/types";

async function requireAdmin() {
  if (!(await isAdminRequest())) {
    throw new Error("Only the banker can do that.");
  }
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  category: Category;
  paidById: string;
  splitMethod: SplitMethod;
  participantIds: string[];
  customShares?: Record<string, number>;
}

export async function createExpense(input: CreateExpenseInput) {
  await requireAdmin();

  const description = input.description.trim();
  const amount = Number(input.amount);
  if (!description) throw new Error("Description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  if (input.participantIds.length === 0) throw new Error("Pick at least one participant.");
  if (input.splitMethod === "custom") {
    if (!input.customShares || hasNegativeShare(input.customShares, input.participantIds)) {
      throw new Error("Custom shares can't be negative.");
    }
    if (!splitsSumMatches(input.customShares, input.participantIds, amount)) {
      throw new Error("Custom shares must add up to the total amount.");
    }
  }

  const splits = computeSplits({
    method: input.splitMethod,
    amount,
    participantIds: input.participantIds,
    customShares: input.customShares,
  });

  const sb = supabaseAdmin();
  // Expense + splits land in one Postgres transaction (see
  // create_expense_with_splits in supabase/schema.sql) — either the whole
  // expense is recorded, or none of it is. Every participant's split,
  // including the payer's own, is an ordinary share; nobody gets a free
  // pass just for executing the payment.
  const { error } = await sb.rpc("create_expense_with_splits", {
    p_description: description,
    p_amount: amount,
    p_category: input.category,
    p_split_method: input.splitMethod,
    p_paid_by_id: input.paidById,
    p_splits: splits.map((s) => ({ user_id: s.userId, amount: s.amount })),
  });
  if (error) throw error;

  revalidatePath("/");
}

export interface UpdateExpenseInput extends CreateExpenseInput {
  expenseId: string;
}

export async function updateExpense(input: UpdateExpenseInput) {
  await requireAdmin();

  const description = input.description.trim();
  const amount = Number(input.amount);
  if (!description) throw new Error("Description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  if (input.participantIds.length === 0) throw new Error("Pick at least one participant.");
  if (input.splitMethod === "custom") {
    if (!input.customShares || hasNegativeShare(input.customShares, input.participantIds)) {
      throw new Error("Custom shares can't be negative.");
    }
    if (!splitsSumMatches(input.customShares, input.participantIds, amount)) {
      throw new Error("Custom shares must add up to the total amount.");
    }
  }

  const splits = computeSplits({
    method: input.splitMethod,
    amount,
    participantIds: input.participantIds,
    customShares: input.customShares,
  });

  const sb = supabaseAdmin();
  // One Postgres transaction (see update_expense_with_splits in
  // supabase/schema.sql) covers updating the expense row and reconciling
  // splits (update-in-place for a still-present participant, insert for
  // anyone new, delete for anyone dropped) — so a crash or failed step
  // can't leave the expense half-updated.
  const { error } = await sb.rpc("update_expense_with_splits", {
    p_expense_id: input.expenseId,
    p_description: description,
    p_amount: amount,
    p_category: input.category,
    p_split_method: input.splitMethod,
    p_paid_by_id: input.paidById,
    p_splits: splits.map((s) => ({ user_id: s.userId, amount: s.amount })),
  });
  if (error) throw error;

  revalidatePath("/");
}

export async function deleteExpense(expenseId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb.from("expenses").delete().eq("id", expenseId);
  if (error) throw error;
  revalidatePath("/");
}

export interface TripSettingsInput {
  tripName: string;
  tripDates: string;
  bankerUpiId: string;
  whatsappGroupJid: string;
}

export async function updateTripSettings(input: TripSettingsInput) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("trip_settings")
    .update({
      trip_name: input.tripName.trim() || "Our Trip",
      trip_dates: input.tripDates.trim() || null,
      banker_upi_id: input.bankerUpiId.trim() || null,
      whatsapp_group_jid: input.whatsappGroupJid.trim() || null,
    })
    .eq("id", 1);
  if (error) throw error;
  revalidatePath("/");
}

/** A deposit is money the banker now holds — pool funding, or a member
 * settling their own balance (both are the same record, see
 * lib/balances.ts). `note` is how the banker tells the two apart if they
 * want to, e.g. "Settling up" vs "UPI transfer". */
export async function addDeposit(input: { userId: string; amount: number; note: string }) {
  await requireAdmin();
  const amount = Number(input.amount);
  if (!input.userId) throw new Error("Pick who deposited.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  const sb = supabaseAdmin();
  const { error } = await sb.from("deposits").insert({
    user_id: input.userId,
    amount,
    note: input.note.trim() || null,
  });
  if (error) throw error;
  revalidatePath("/");
}

export async function removeDeposit(depositId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb.from("deposits").delete().eq("id", depositId);
  if (error) throw error;
  revalidatePath("/");
}

/** The reverse of a deposit: the banker paying a member back. */
export async function addPayout(input: { userId: string; amount: number; note: string }) {
  await requireAdmin();
  const amount = Number(input.amount);
  if (!input.userId) throw new Error("Pick who's being paid.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  const sb = supabaseAdmin();
  const { error } = await sb.from("payouts").insert({
    user_id: input.userId,
    amount,
    note: input.note.trim() || null,
  });
  if (error) throw error;
  revalidatePath("/");
}

export async function removePayout(payoutId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb.from("payouts").delete().eq("id", payoutId);
  if (error) throw error;
  revalidatePath("/");
}

export async function addMember(input: { name: string; phoneNumber: string; isAdmin: boolean }) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const sb = supabaseAdmin();
  const { count } = await sb.from("trip_users").select("id", { count: "exact", head: true });
  const { error } = await sb.from("trip_users").insert({
    name,
    phone_number: input.phoneNumber.trim() || null,
    is_admin: input.isAdmin,
    sort_order: count ?? 0,
  });
  if (error) throw error;
  revalidatePath("/");
}

export async function removeMember(userId: string) {
  await requireAdmin();
  const sb = supabaseAdmin();

  // Every foreign key into trip_users (expense_splits.user_id,
  // expenses.paid_by_id, deposits.user_id, payouts.user_id) is ON DELETE
  // CASCADE/SET NULL — so deleting a member with money tied to them
  // wouldn't error, it would silently erase their debt, detach their
  // paid-for expenses from the pool total, or vanish their deposits/
  // payouts. None of that is reversible, so it's blocked outright rather
  // than left to the banker's judgment.
  const [splits, paidExpenses, deposits, payouts] = await Promise.all([
    sb.from("expense_splits").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("expenses").select("id", { count: "exact", head: true }).eq("paid_by_id", userId),
    sb.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("payouts").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (splits.error) throw splits.error;
  if (paidExpenses.error) throw paidExpenses.error;
  if (deposits.error) throw deposits.error;
  if (payouts.error) throw payouts.error;

  if ((splits.count ?? 0) > 0 || (paidExpenses.count ?? 0) > 0 || (deposits.count ?? 0) > 0 || (payouts.count ?? 0) > 0) {
    throw new Error("Can't remove someone with expenses, deposits, or payouts tied to them — their share of the ledger would be lost.");
  }

  const { error } = await sb.from("trip_users").delete().eq("id", userId);
  if (error) throw error;
  revalidatePath("/");
}

/** Switches this browser back to the read-only friend view. */
export async function exitAdminMode() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  revalidatePath("/");
}
