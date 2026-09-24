import type { Deposit, Expense, Payout, TripUser } from "@/types";

/**
 * Money is never allowed to carry more than paisa precision. JS numbers are
 * IEEE-754 floats, so plain addition/subtraction of two-decimal amounts can
 * leave dust like 0.30000000000000004 or -5.55e-17 — small enough to be
 * invisible when rounded for display, but not zero, so a comparison like
 * `netOwed < 0` can still flip to "in credit" for someone who is exactly
 * even. Rounding after every accumulation keeps that dust from ever
 * building up or leaking into a sign comparison.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Splits `total` across `weights` proportionally, exact to the paisa.
 * Flooring each share independently and then handing out whatever's left
 * one cent at a time (rather than naive proportional rounding) keeps the
 * shares always summing to exactly `total` — the same fix computeSplits
 * uses for expense splits, needed here for the same reason: independent
 * rounding of 3+ shares can otherwise lose or gain a paisa in aggregate.
 */
function distributeProportional(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).sort();
  const totalWeight = ids.reduce((a, id) => a + weights[id], 0);
  const shares: Record<string, number> = {};
  if (ids.length === 0 || totalWeight <= 0) return shares;

  let distributed = 0;
  for (const id of ids) {
    const share = Math.floor(((total * weights[id]) / totalWeight) * 100 + Number.EPSILON) / 100;
    shares[id] = share;
    distributed = round2(distributed + share);
  }
  let remainder = round2(total - distributed);
  for (let i = ids.length - 1; i >= 0 && remainder > 0; i--) {
    const bump = Math.min(remainder, 0.01);
    shares[ids[i]] = round2(shares[ids[i]] + bump);
    remainder = round2(remainder - bump);
  }
  return shares;
}

export interface Balances {
  /** Net amount each user still owes: their total split share, minus every
   * credit (deposits, personally-fronted expenses, payouts received),
   * floored at 0. This is what every screen shows as "owed". */
  owed: Record<string, number>;
  /** Same as `owed` but not floored — negative means the user is in credit. */
  netOwed: Record<string, number>;
  /** Total credited per user from deposits alone (pool funding or settling
   * up) — not the full credit picture, see `netOwed` for that. */
  deposited: Record<string, number>;
  /** Every split a user is part of, for an itemized breakdown of what makes
   * up their total share. There's no paid/pending distinction per item —
   * settlement is tracked only as an aggregate (a deposit), not per split. */
  items: Record<string, { description: string; amount: number }[]>;
  /** Total of every expense, regardless of who paid or how. */
  spent: number;
  /** Total of expenses paid by a banker — assumed to be the shared pool's
   * cash, the portion that actually drew down the pool. */
  poolSpent: number;
  /** Total of expenses paid by anyone else, fronted from their own pocket. */
  personalSpent: number;
  /** Sum of all deposits — real money that entered the pool, whether pool
   * funding or a member settling their own balance. */
  depositedTotal: number;
  /** Sum of all payouts — money the banker has paid back to members. */
  payoutTotal: number;
  /** Cash the banker is currently holding: depositedTotal − poolSpent −
   * payoutTotal. Negative means banker-paid spending (plus payouts) has
   * drawn out more than was ever deposited — see `poolDeficit`. */
  pool: number;
  /** How much of a negative `pool` has been credited back to whoever's
   * responsible: max(0, -pool). Distributed proportionally to each banker's
   * share of pool-spent expenses; if nobody has any (e.g. the deficit is
   * entirely from payouts, which have no "paid by" of their own), it's
   * split evenly across bankers instead, since addPayout always requires
   * admin auth — a banker is necessarily who executed it. */
  poolDeficit: number;
  /** Sum of `owed` (floored) across everyone — "how much is still left to
   * collect". */
  unsettledTotal: number;
}

export function computeBalances(
  expenses: Expense[],
  users: TripUser[],
  deposits: Deposit[] = [],
  payouts: Payout[] = []
): Balances {
  const rawOwed: Record<string, number> = {};
  const paid: Record<string, number> = {};
  const deposited: Record<string, number> = {};
  const paidOut: Record<string, number> = {};
  const items: Record<string, { description: string; amount: number }[]> = {};
  const poolSpentByPayer: Record<string, number> = {};
  const bankerIds = new Set(users.filter((u) => u.is_admin).map((u) => u.id));

  users.forEach((u) => {
    rawOwed[u.id] = 0;
    paid[u.id] = 0;
    deposited[u.id] = 0;
    paidOut[u.id] = 0;
    items[u.id] = [];
  });

  let spent = 0;
  let poolSpent = 0;
  let personalSpent = 0;
  for (const e of expenses) {
    const amount = Number(e.amount);
    spent = round2(spent + amount);

    for (const s of e.splits) {
      rawOwed[s.user_id] = round2((rawOwed[s.user_id] ?? 0) + Number(s.split_amount));
      (items[s.user_id] ??= []).push({ description: e.description, amount: Number(s.split_amount) });
    }

    if (e.paid_by_id && bankerIds.has(e.paid_by_id)) {
      poolSpent = round2(poolSpent + amount);
      poolSpentByPayer[e.paid_by_id] = round2((poolSpentByPayer[e.paid_by_id] ?? 0) + amount);
    } else {
      personalSpent = round2(personalSpent + amount);
      if (e.paid_by_id) paid[e.paid_by_id] = round2((paid[e.paid_by_id] ?? 0) + amount);
    }
  }

  for (const d of deposits) {
    deposited[d.user_id] = round2((deposited[d.user_id] ?? 0) + Number(d.amount));
  }
  for (const p of payouts) {
    paidOut[p.user_id] = round2((paidOut[p.user_id] ?? 0) + Number(p.amount));
  }

  const depositedTotal = round2(deposits.reduce((a, d) => a + Number(d.amount), 0));
  const payoutTotal = round2(payouts.reduce((a, p) => a + Number(p.amount), 0));
  const pool = round2(depositedTotal - poolSpent - payoutTotal);

  // If banker-paid spending (plus payouts) has drawn out more than was ever
  // deposited, that shortfall was necessarily floated from someone's own
  // pocket — credit them for it. Attributed by each banker's share of
  // pool-spent expenses; if nobody has any (the deficit is entirely from
  // payouts, which aren't tied to a specific payer), split evenly across
  // bankers instead, since addPayout always requires admin auth.
  const poolDeficit = round2(Math.max(0, -pool));
  const deficitCredit: Record<string, number> = {};
  if (poolDeficit > 0) {
    const hasWeight = Object.values(poolSpentByPayer).some((w) => w > 0);
    if (hasWeight) {
      Object.assign(deficitCredit, distributeProportional(poolDeficit, poolSpentByPayer));
    } else {
      const bankerWeights: Record<string, number> = {};
      users.filter((u) => u.is_admin).forEach((u) => (bankerWeights[u.id] = 1));
      Object.assign(deficitCredit, distributeProportional(poolDeficit, bankerWeights));
    }
  }

  const netOwed: Record<string, number> = {};
  const owed: Record<string, number> = {};
  users.forEach((u) => {
    const net = round2(
      (rawOwed[u.id] ?? 0) - (deposited[u.id] ?? 0) - (paid[u.id] ?? 0) - (deficitCredit[u.id] ?? 0) + (paidOut[u.id] ?? 0)
    );
    netOwed[u.id] = net;
    owed[u.id] = Math.max(0, net);
  });

  const unsettledTotal = round2(Object.values(owed).reduce((a, b) => a + b, 0));

  return { owed, netOwed, deposited, items, spent, poolSpent, personalSpent, depositedTotal, payoutTotal, pool, poolDeficit, unsettledTotal };
}
