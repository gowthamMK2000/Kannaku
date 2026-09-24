// Live data-integrity canary for the money math.
//
// computeBalances (lib/balances.ts) has no input validation by design — it's
// a pure aggregator that trusts expenses/splits/deposits/payouts completely,
// on the assumption that app/actions.ts + the DB schema keep the data
// well-formed. This script is the check that would actually catch it if
// that assumption were ever wrong (a direct DB edit, a future bug, a
// migration gone wrong): it recomputes the real balances against the live
// database and checks them against the closed-form invariant, derived and
// verified (5000 random trips, zero deviation) in this project's history:
//
//   sum(netOwed) === min(0, -pool)
//
// When the pool is healthy (pool >= 0), any surplus sits as aggregate
// credit (-pool). When the pool is in deficit (pool < 0), poolDeficit
// crediting closes the loop completely — every negative dollar is
// attributed to whoever's responsible (proportional to their pool-tagged
// spending, falling back to an even split across bankers if nobody has
// any — e.g. the deficit is entirely from payouts) — so the sum comes back
// to exactly 0. No exceptions needed for legacy fallback figures or
// settled-split bookkeeping — neither concept exists in this model.
//
// Usage: node --experimental-strip-types --env-file=.env scripts/check-balances-invariant.mjs

import { createClient } from "@supabase/supabase-js";
import { computeBalances } from "../lib/balances.ts";

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const [usersRes, expensesRes, depositsRes, payoutsRes] = await Promise.all([
  sb.from("trip_users").select("*"),
  sb.from("expenses").select("*, splits:expense_splits(*)"),
  sb.from("deposits").select("*"),
  sb.from("payouts").select("*"),
]);
for (const res of [usersRes, expensesRes, depositsRes, payoutsRes]) {
  if (res.error) {
    console.error("Query failed:", res.error.message);
    process.exit(2);
  }
}

const users = usersRes.data ?? [];
const expenses = expensesRes.data ?? [];
const deposits = depositsRes.data ?? [];
const payouts = payoutsRes.data ?? [];

const b = computeBalances(expenses, users, deposits, payouts);

const actualSum = round2(Object.values(b.netOwed).reduce((a, v) => a + v, 0));
const expectedSum = round2(Math.min(0, -b.pool));
const diff = round2(actualSum - expectedSum);

console.log("=== Kanakku balances invariant check ===");
console.log(`Users: ${users.length}   Expenses: ${expenses.length}   Deposits: ${deposits.length}   Payouts: ${payouts.length}`);
console.log(`spent=${b.spent}  poolSpent=${b.poolSpent}  personalSpent=${b.personalSpent}`);
console.log(`depositedTotal=${b.depositedTotal}  payoutTotal=${b.payoutTotal}  pool=${b.pool}  poolDeficit=${b.poolDeficit}`);
console.log(`sum(netOwed) actual=${actualSum}  expected=${expectedSum}  diff=${diff}`);

if (Math.abs(diff) <= 0.01) {
  console.log("\nOK — balances are internally consistent.");
  process.exit(0);
}

console.log("\nFAIL — sum(netOwed) doesn't match the expected invariant. Investigating likely causes...\n");

const userIds = new Set(users.map((u) => u.id));
const findings = [];

for (const e of expenses) {
  const splitSum = round2((e.splits ?? []).reduce((a, s) => a + Number(s.split_amount), 0));
  if (Math.abs(splitSum - Number(e.amount)) > 0.01) {
    findings.push(`Expense "${e.description}" (${e.id}): splits sum to ${splitSum} but amount is ${e.amount}.`);
  }
  if (e.paid_by_id && !userIds.has(e.paid_by_id)) {
    findings.push(`Expense "${e.description}" (${e.id}): paid_by_id ${e.paid_by_id} isn't a current trip member.`);
  }
  for (const s of e.splits ?? []) {
    if (!userIds.has(s.user_id)) {
      findings.push(`Expense "${e.description}" (${e.id}): split for ${s.user_id}, who isn't a current trip member — this debt is invisible in the UI.`);
    }
  }
  if (Number(e.amount) < 0) {
    findings.push(`Expense "${e.description}" (${e.id}): negative amount (${e.amount}).`);
  }
}

for (const d of deposits) {
  if (!userIds.has(d.user_id)) findings.push(`Deposit ${d.id}: user_id ${d.user_id} isn't a current trip member.`);
  if (Number(d.amount) < 0) findings.push(`Deposit ${d.id}: negative amount (${d.amount}).`);
}

for (const p of payouts) {
  if (!userIds.has(p.user_id)) findings.push(`Payout ${p.id}: user_id ${p.user_id} isn't a current trip member.`);
  if (Number(p.amount) < 0) findings.push(`Payout ${p.id}: negative amount (${p.amount}).`);
}

if (findings.length > 0) {
  findings.forEach((f) => console.log(" - " + f));
} else {
  console.log("No structural cause found (mismatched split sums, orphaned references, negative amounts).");
  console.log("The discrepancy may be a genuine computeBalances regression — check recent changes to lib/balances.ts.");
  console.log("\nPer-user netOwed:", b.netOwed);
}

process.exit(1);
