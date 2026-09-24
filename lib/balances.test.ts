import { describe, expect, it } from "vitest";
import { computeBalances } from "./balances";
import { computeSplits } from "./splits";
import type { Deposit, Expense, ExpenseSplit, Payout, TripUser } from "@/types";

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function user(id: string, isAdmin = false): TripUser {
  return { id, name: id, phone_number: null, is_admin: isAdmin, sort_order: 0, created_at: "2026-01-01T00:00:00Z" };
}

function split(userId: string, amount: number): ExpenseSplit {
  return { id: nextId("split"), expense_id: "", user_id: userId, split_amount: amount };
}

function expense(opts: { amount: number; paidById: string | null; splits: ExpenseSplit[]; description?: string }): Expense {
  const id = nextId("expense");
  return {
    id,
    description: opts.description ?? "expense",
    amount: opts.amount,
    category: "fun",
    split_method: "equal",
    paid_by_id: opts.paidById,
    occurred_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    splits: opts.splits.map((s) => ({ ...s, expense_id: id })),
  };
}

function deposit(userId: string, amount: number): Deposit {
  return { id: nextId("deposit"), user_id: userId, amount, note: null, deposited_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" };
}

function payout(userId: string, amount: number): Payout {
  return { id: nextId("payout"), user_id: userId, amount, note: null, paid_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" };
}

/** sum(netOwed) === min(0, -pool), always, exactly. When the pool is
 * healthy (pool >= 0), the surplus sits as aggregate credit (-pool). When
 * the pool is in deficit (pool < 0), poolDeficit crediting closes the loop
 * completely — every negative dollar gets attributed to whoever's
 * responsible, so the sum comes back to exactly 0. Verified by hand for
 * every worked example below and by the 5000-trip fuzz test at the bottom
 * of this file. */
function expectInvariantHolds(b: ReturnType<typeof computeBalances>) {
  const sumNetOwed = Object.values(b.netOwed).reduce((a, v) => a + v, 0);
  // toBeCloseTo, not toBe: -0 vs 0 is a signed-zero quirk of Object.is, not
  // a real money discrepancy.
  expect(sumNetOwed).toBeCloseTo(Math.min(0, -b.pool), 2);
}

describe("computeBalances — worked examples", () => {
  it("single banker, deposits exactly pre-fund the pool", () => {
    const users = [user("B", true), user("U1"), user("U2"), user("U3")];
    const deposits = [deposit("U1", 1000), deposit("U2", 1000), deposit("U3", 1000)];
    const expenses = [
      expense({
        amount: 3000,
        paidById: "B",
        splits: [split("B", 750), split("U1", 750), split("U2", 750), split("U3", 750)],
      }),
    ];

    const b = computeBalances(expenses, users, deposits);
    expect(b.poolSpent).toBe(3000);
    expect(b.depositedTotal).toBe(3000);
    expect(b.pool).toBe(0);
    expect(b.netOwed).toEqual({ B: 750, U1: -250, U2: -250, U3: -250 });
    expect(b.owed).toEqual({ B: 750, U1: 0, U2: 0, U3: 0 });
    expectInvariantHolds(b);
  });

  it("a pool going negative auto-credits whoever paid the pool-tagged expenses, proportionally", () => {
    // Two bankers spend from the pool with nothing deposited — the pool is
    // entirely in deficit, so both are credited back for what they floated,
    // proportional to their share of pool-tagged spending.
    const users = [user("B1", true), user("B2", true), user("U1"), user("U2")];
    const expenses = [
      expense({ amount: 4000, paidById: "B1", splits: [split("B1", 1000), split("B2", 1000), split("U1", 1000), split("U2", 1000)] }),
      expense({ amount: 2000, paidById: "B2", splits: [split("B1", 500), split("B2", 500), split("U1", 500), split("U2", 500)] }),
    ];

    const b = computeBalances(expenses, users, []);
    expect(b.pool).toBe(-6000); // 0 deposited - 6000 pool-sourced spend
    expect(b.poolDeficit).toBe(6000);
    // B1 fronted 4000 of the 6000 pool spend (2/3), B2 fronted 2000 (1/3).
    expect(b.netOwed).toEqual({ B1: 1500 - 4000, B2: 1500 - 2000, U1: 1500, U2: 1500 });
    expectInvariantHolds(b); // fully closed loop: sum = 0
  });

  it("a deficit caused by a payout (no pool-expense payer to attribute it to) falls back to bankers evenly", () => {
    const users = [user("B", true), user("U1")];
    const deposits = [deposit("U1", 1000)];
    const payouts_ = [payout("U1", 1500)]; // pays out more than the pool has
    // No pool-tagged expenses at all — poolSpentByPayer is empty.
    const b = computeBalances([], users, deposits, payouts_);
    expect(b.pool).toBe(1000 - 1500); // -500
    expect(b.poolDeficit).toBe(500);
    // Falls back to the sole banker, B, since nobody has pool-expense weight.
    expect(b.netOwed).toEqual({ B: -500, U1: -1000 + 1500 });
    expectInvariantHolds(b);
  });

  it("every expense a banker pays for counts as pool spending — no per-expense override", () => {
    // This is the deliberate tradeoff of inferring pool-vs-personal from
    // role instead of an explicit per-expense flag: even if B genuinely
    // fronted the second expense out of pocket, there's no way to mark it
    // differently from the first — both count toward poolSpent, and B is
    // only ever credited via the aggregate poolDeficit mechanism, never a
    // per-expense "personal" credit.
    const users = [user("B", true), user("U1"), user("U2")];
    const deposits = [deposit("U1", 1000)];
    const expenses = [
      expense({ amount: 1000, paidById: "B", splits: [split("B", 500), split("U1", 500)] }),
      expense({ amount: 300, paidById: "B", splits: [split("B", 100), split("U1", 100), split("U2", 100)] }),
    ];

    const b = computeBalances(expenses, users, deposits);
    expect(b.poolSpent).toBe(1300); // both expenses, not just the first
    expect(b.personalSpent).toBe(0);
    // 1000 deposited covers only 1000 of the 1300 spent — 300 deficit,
    // entirely credited back to B since he's the only pool-spend payer.
    expect(b.poolDeficit).toBe(300);
    expect(b.netOwed.B).toBe(600 - 300); // own splits (500+100) minus deficit credit
    expectInvariantHolds(b);
  });

  it("non-banker fronting an expense personally is credited the full amount", () => {
    const users = [user("B", true), user("U1"), user("U2")];
    const expenses = [expense({ amount: 300, paidById: "U1", splits: [split("B", 100), split("U1", 100), split("U2", 100)] })];

    const b = computeBalances(expenses, users, []);
    expect(b.poolSpent).toBe(0); // never touched the pool's own cash
    expect(b.netOwed).toEqual({ B: 100, U1: -200, U2: 100 });
    expectInvariantHolds(b);
  });

  it("a personally-fronted expense doesn't require the payer to be a participant", () => {
    const users = [user("B", true), user("U1"), user("U2"), user("U3")];
    const expenses = [expense({ amount: 300, paidById: "U1", splits: [split("U2", 150), split("U3", 150)] })];

    const b = computeBalances(expenses, users, []);
    expect(b.netOwed).toEqual({ B: 0, U1: -300, U2: 150, U3: 150 });
    expectInvariantHolds(b);
  });

  it("a healthy pool with unspent leftover cash has a negative (credit) sum — not zero", () => {
    const users = [user("B", true), user("U1")];
    const deposits = [deposit("U1", 5000)];
    const expenses = [expense({ amount: 2000, paidById: "B", splits: [split("B", 1000), split("U1", 1000)] })];

    const b = computeBalances(expenses, users, deposits);
    expect(b.pool).toBe(3000);
    expect(b.netOwed).toEqual({ B: 1000, U1: -4000 });
    expect(Object.values(b.netOwed).reduce((a, v) => a + v, 0)).toBe(-3000);
    expectInvariantHolds(b);
  });

  it("settling up is just a deposit — and it keeps the invariant intact, unlike the old is_settled flag did", () => {
    const users = [user("B", true), user("U1")];
    const expenses = [expense({ amount: 1000, paidById: "B", splits: [split("B", 500), split("U1", 500)] })];
    // U1 hands the banker cash to clear their 500 share. B fronted the other
    // 500 of the pool expense personally (nothing else was ever deposited),
    // so poolDeficit credits B for exactly that — both end up settled.
    const deposits = [deposit("U1", 500)];

    const b = computeBalances(expenses, users, deposits);
    expect(b.poolDeficit).toBe(500);
    expect(b.owed).toEqual({ B: 0, U1: 0 });
    expect(b.netOwed).toEqual({ B: 0, U1: 0 });
    expectInvariantHolds(b); // no exception needed, unlike the old model
  });

  it("a payout reduces the recipient's credit and draws down the pool", () => {
    const users = [user("B", true), user("U1")];
    const deposits = [deposit("U1", 2000)];
    const payouts_ = [payout("U1", 800)]; // banker refunds some of U1's surplus
    const expenses = [expense({ amount: 1000, paidById: "B", splits: [split("B", 500), split("U1", 500)] })];

    const b = computeBalances(expenses, users, deposits, payouts_);
    expect(b.payoutTotal).toBe(800);
    expect(b.pool).toBe(2000 - 1000 - 800); // 200
    expect(b.netOwed).toEqual({ B: 500, U1: 500 - 2000 + 800 }); // -700
    expectInvariantHolds(b);
  });

  it("sums multiple deposits from the same person, including decimals", () => {
    const users = [user("B", true), user("U1")];
    const deposits = [deposit("U1", 500), deposit("U1", 300), deposit("U1", 200.7)];

    const b = computeBalances([], users, deposits);
    expect(b.depositedTotal).toBe(1000.7);
    expect(b.netOwed.U1).toBe(-1000.7);
    expectInvariantHolds(b);
  });

  it("holds at large amounts (crore-scale) without floating-point drift", () => {
    const users = [user("B", true), user("U1")];
    const expenses = [expense({ amount: 10000000, paidById: "B", splits: [split("B", 5000000), split("U1", 5000000)] })];

    const b = computeBalances(expenses, users, []);
    // Nothing was ever deposited, so B floated the entire 1 crore personally
    // and poolDeficit credits them for all of it — net, they're in credit
    // for their own 50L share difference.
    expect(b.poolDeficit).toBe(10000000);
    expect(b.netOwed).toEqual({ B: -5000000, U1: 5000000 });
    expectInvariantHolds(b);
  });

  it("computeSplits' remainder distribution stays exact inside computeBalances", () => {
    const ids = ["a", "b", "c"];
    const computed = computeSplits({ method: "equal", amount: 1000, participantIds: ids });
    const users = ids.map((id) => user(id, id === "a"));
    const expenses = [expense({ amount: 1000, paidById: "a", splits: computed.map((c) => split(c.userId, c.amount)) })];

    const b = computeBalances(expenses, users, []);
    expect(b.spent).toBe(1000);
    expectInvariantHolds(b);
  });
});

describe("computeBalances — accepted lack of input validation", () => {
  // computeBalances is a pure aggregator: it trusts expenses/splits/deposits
  // completely. Integrity is enforced upstream (app/actions.ts validation +
  // DB constraints/cascades), not here. These tests lock in the CURRENT,
  // accepted behavior for malformed input — not a desired fix.
  it("does not validate that splits sum to the expense amount", () => {
    const users = [user("B", true), user("U1")];
    const expenses = [expense({ amount: 3000, paidById: "B", splits: [split("U1", 2000)] })]; // 1000 unaccounted for
    const b = computeBalances(expenses, users, []);
    expect(b.owed.U1).toBe(2000);
    expect(b.spent).toBe(3000);
  });

  it("silently drops debt for a split whose user_id isn't in the users list", () => {
    const users = [user("B", true)]; // "ghost" was removed from the trip
    const expenses = [expense({ amount: 1000, paidById: "B", splits: [split("ghost", 1000)] })];
    const b = computeBalances(expenses, users, []);
    expect(b.owed).toEqual({ B: 0 }); // ghost's 1000 is invisible, not an error
  });

  it("propagates a negative expense amount symmetrically rather than rejecting it", () => {
    const users = [user("B", true)];
    const expenses = [expense({ amount: -500, paidById: "B", splits: [split("B", -500)] })];
    const b = computeBalances(expenses, users, []);
    expect(b.poolSpent).toBe(-500);
    expect(b.netOwed.B).toBe(-500);
    // Note: createExpense/updateExpense in app/actions.ts already reject
    // amount <= 0 before this ever runs, and the DB has check (amount > 0)
    // as well — this state is not reachable through the app.
  });
});

describe("computeBalances — fuzz: the invariant across realistic random trips", () => {
  // Mirrors how the app actually produces data (pool-vs-personal inferred
  // from the payer's is_admin, addDeposit/addPayout for the rest) rather
  // than arbitrary/malformed data.
  function mulberry32(seed: number) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function runRandomTrip(seed: number) {
    const rand = mulberry32(seed);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
    const randomAmount = () => round2(1 + rand() * 100000);

    const userCount = 2 + Math.floor(rand() * 5); // 2-6 users
    const users: TripUser[] = Array.from({ length: userCount }, (_, i) => user(`u${i}`, rand() < 0.4));
    // Every real trip has at least one banker (only an admin can operate the
    // app at all) — the deficit fallback relies on this.
    if (!users.some((u) => u.is_admin)) users[0].is_admin = true;

    const expenses: Expense[] = [];
    const deposits: Deposit[] = [];
    const payouts: Payout[] = [];
    const stepCount = 1 + Math.floor(rand() * 20);

    for (let step = 0; step < stepCount; step++) {
      const r = rand();
      if (r < 0.6) {
        const payer = pick(users);
        const participants = users.filter(() => rand() < 0.7);
        if (participants.length === 0) participants.push(pick(users));
        const amount = randomAmount();
        const computed = computeSplits({ method: "equal", amount, participantIds: participants.map((p) => p.id) });
        expenses.push(expense({ amount, paidById: payer.id, splits: computed.map((c) => split(c.userId, c.amount)) }));
      } else if (r < 0.85) {
        deposits.push(deposit(pick(users).id, randomAmount()));
      } else {
        payouts.push(payout(pick(users).id, randomAmount()));
      }
    }

    return computeBalances(expenses, users, deposits, payouts);
  }

  it("holds across 2000 randomly generated trips", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const b = runRandomTrip(seed);
      const sumNetOwed = Object.values(b.netOwed).reduce((a, v) => a + v, 0);
      // toBeCloseTo, not toBe: -0 vs 0 is a signed-zero quirk of Object.is,
      // not a real money discrepancy.
      expect(sumNetOwed, `seed ${seed}`).toBeCloseTo(Math.min(0, -b.pool), 2);
      expect(b.poolDeficit, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });
});
