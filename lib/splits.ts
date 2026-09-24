import type { SplitMethod } from "@/types";

export interface SplitInput {
  method: SplitMethod;
  amount: number;
  participantIds: string[];
  /** Required when method === "custom": user id -> share. Must sum to `amount`. */
  customShares?: Record<string, number>;
}

export interface ComputedSplit {
  userId: string;
  amount: number;
}

const CENT = 0.01;

/**
 * Turns a split method + participant list into per-person amounts that add
 * up exactly to the total (equal/select divide evenly, with any rounding
 * remainder absorbed by the last participant so paise are never lost).
 */
export function computeSplits(input: SplitInput): ComputedSplit[] {
  const { method, amount, participantIds } = input;
  if (participantIds.length === 0) return [];

  if (method === "custom") {
    const shares = input.customShares || {};
    return participantIds.map((userId) => ({
      userId,
      amount: Math.round((shares[userId] ?? 0) * 100) / 100,
    }));
  }

  const base = Math.floor((amount / participantIds.length) * 100) / 100;
  const rounded = participantIds.map(() => base);
  const distributed = Math.round(base * participantIds.length * 100) / 100;
  let remainder = Math.round((amount - distributed) * 100) / 100;

  // Hand out the last few paise, one cent at a time, so the split always
  // sums to exactly `amount` instead of drifting from rounding.
  for (let i = rounded.length - 1; i >= 0 && remainder > 0; i--) {
    const bump = Math.min(remainder, CENT);
    rounded[i] = Math.round((rounded[i] + bump) * 100) / 100;
    remainder = Math.round((remainder - bump) * 100) / 100;
  }

  return participantIds.map((userId, i) => ({ userId, amount: rounded[i] }));
}

export function splitsSumMatches(shares: Record<string, number>, participantIds: string[], amount: number): boolean {
  const sum = participantIds.reduce((acc, id) => acc + (Number(shares[id]) || 0), 0);
  return Math.abs(sum - amount) < 0.01;
}

/**
 * A custom share below zero isn't a real split — it's an unearned credit
 * that isn't backed by any actual deposit, and it can still pass
 * `splitsSumMatches` as long as some other participant's share is inflated
 * to compensate (e.g. -200 and 700 on a ₹500 expense). Reject it outright.
 */
export function hasNegativeShare(shares: Record<string, number>, participantIds: string[]): boolean {
  return participantIds.some((id) => Number(shares[id] ?? 0) < 0);
}
