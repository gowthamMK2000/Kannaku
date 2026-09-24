"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Expense, TripData, TripUser } from "@/types";
import { computeBalances } from "@/lib/balances";
import { avatarColors, CATEGORY_META, formatDay, formatTime, initials, inr } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabaseClient";
import {
  CategoryIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  EyeIcon,
  ExpensesNavIcon,
  HomeNavIcon,
  InfoIcon,
  LogoMark,
  OwesNavIcon,
} from "@/components/icons";

type Screen = "welcome" | "home" | "expenses" | "owes";
const ME_KEY = "kanakku:me";
const CHIPS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "food", label: "Food" },
  { key: "stay", label: "Stay" },
  { key: "travel", label: "Travel" },
  { key: "fun", label: "Fun" },
] as const;

export default function FriendApp({ data }: { data: TripData }) {
  const { settings, users, expenses, deposits, payouts } = data;
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [meId, setMeId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [sheetExpenseId, setSheetExpenseId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // One-time hydration from localStorage: `window` doesn't exist during SSR,
  // so this can't move into a useState initializer without a server/client
  // hydration mismatch. `ready` gates the first paint until this has run, so
  // there's no visible flash between the two renders.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = window.localStorage.getItem(ME_KEY);
    if (stored) {
      setMeId(stored);
      setScreen("home");
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel("kanakku-friend")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_settings" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => router.refresh())
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [router]);

  const hasMe = !!meId && meId !== "none";
  const me = hasMe ? users.find((u) => u.id === meId) ?? null : null;

  const balances = useMemo(() => computeBalances(expenses, users, deposits, payouts), [expenses, users, deposits, payouts]);
  const effectiveCategory = category === "mine" && !hasMe ? "all" : category;

  function pickMember(id: string) {
    window.localStorage.setItem(ME_KEY, id);
    setMeId(id);
    setScreen("home");
    setCategory("all");
  }
  function browse() {
    window.localStorage.setItem(ME_KEY, "none");
    setMeId("none");
    setScreen("home");
    setCategory("all");
  }
  function copyUpi() {
    if (settings.banker_upi_id) navigator.clipboard?.writeText(settings.banker_upi_id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (!ready) return null;

  if (screen === "welcome") {
    return <WelcomeScreen settings={settings} users={users} onPick={pickMember} onBrowse={browse} />;
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-paper">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen === "home" && (
          <HomeScreen
            settings={settings}
            users={users}
            expenses={expenses}
            balances={balances}
            me={me}
            hasMe={hasMe}
            copied={copied}
            onCopy={copyUpi}
            onSwitchMe={() => setScreen("welcome")}
            onGoExpenses={() => {
              setCategory("all");
              setScreen("expenses");
            }}
            onGoMine={() => {
              setCategory("mine");
              setScreen("expenses");
            }}
            onOpenExpense={(id) => setSheetExpenseId(id)}
          />
        )}
        {screen === "expenses" && (
          <ExpensesScreen
            users={users}
            expenses={expenses}
            meId={meId}
            hasMe={hasMe}
            category={effectiveCategory}
            onCategory={setCategory}
            onOpenExpense={(id) => setSheetExpenseId(id)}
          />
        )}
        {screen === "owes" && <WhoOwesScreen users={users} balances={balances} meId={meId} />}
      </div>
      <BottomNav screen={screen} onChange={setScreen} />
      {sheetExpenseId && (
        <ExpenseDetailSheet
          expense={expenses.find((e) => e.id === sheetExpenseId) ?? null}
          users={users}
          meId={meId}
          onClose={() => setSheetExpenseId(null)}
        />
      )}
    </div>
  );
}

function WelcomeScreen({
  settings,
  users,
  onPick,
  onBrowse,
}: {
  settings: TripData["settings"];
  users: TripUser[];
  onPick: (id: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-7 bg-paper px-6 pb-7 pt-12">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-display text-[22px] font-semibold">Kanakku</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-bold uppercase tracking-wider text-jade">Trip ledger</div>
        <h1 className="font-display text-[42px] font-semibold leading-[1.03]">{settings.trip_name}</h1>
        <div className="text-muted">{settings.trip_dates || `${users.length} people`}</div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-lg font-bold">Who&apos;s checking in?</div>
        <div className="text-sm text-muted">Pick your name to see what you owe. You can switch any time.</div>
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          {users.map((m) => {
            const c = avatarColors(m.id, m.is_admin);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onPick(m.id)}
                className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left"
              >
                <span
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {initials(m.name)}
                </span>
                <span className="flex flex-col">
                  <span className="font-bold">{m.name}</span>
                  <span className="text-xs text-muted">{m.is_admin ? "Banker" : "Member"}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onBrowse} className="min-h-11 self-center px-4 font-bold text-jade">
          Just browsing — skip
        </button>
      </div>
      <div className="mt-auto flex items-start gap-3 rounded-2xl bg-sand px-4 py-3.5">
        <EyeIcon className="mt-0.5 shrink-0 text-muted-3" width={20} height={20} />
        <div className="text-[13px] text-muted-3">
          This is a view-only link. You can see every rupee in and out — only the banker can add or change entries.
        </div>
      </div>
    </div>
  );
}

function HomeScreen({
  settings,
  users,
  expenses,
  balances,
  me,
  hasMe,
  copied,
  onCopy,
  onSwitchMe,
  onGoExpenses,
  onGoMine,
  onOpenExpense,
}: {
  settings: TripData["settings"];
  users: TripUser[];
  expenses: Expense[];
  balances: ReturnType<typeof computeBalances>;
  me: TripUser | null;
  hasMe: boolean;
  copied: boolean;
  onCopy: () => void;
  onSwitchMe: () => void;
  onGoExpenses: () => void;
  onGoMine: () => void;
  onOpenExpense: (id: string) => void;
}) {
  const myOwed = me ? balances.owed[me.id] ?? 0 : 0;
  const myCredit = me ? Math.max(0, -(balances.netOwed[me.id] ?? 0)) : 0;
  const spentPct =
    balances.depositedTotal > 0 ? Math.round(((balances.poolSpent + balances.payoutTotal) / balances.depositedTotal) * 100) : 0;
  const owingCount = users.filter((u) => (balances.owed[u.id] ?? 0) > 0).length;

  const catTotals: Record<string, number> = {};
  expenses.forEach((e) => (catTotals[e.category] = (catTotals[e.category] ?? 0) + Number(e.amount)));
  const topCatKey = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
  const meColors = me ? avatarColors(me.id, me.is_admin) : { bg: "#EBE6DA", fg: "#1B1A17" };

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm text-muted">{hasMe ? `Hi, ${me?.name}` : "Hi there"}</div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">{settings.trip_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-sand px-2.5 text-xs font-bold text-muted-3">
            <EyeIcon width={14} height={14} />
            View only
          </span>
          <button
            type="button"
            aria-label="Switch person"
            onClick={onSwitchMe}
            className="h-11 w-11 rounded-full border-2 border-surface text-sm font-extrabold"
            style={{ background: meColors.bg, color: meColors.fg }}
          >
            {hasMe && me ? initials(me.name) : "?"}
          </button>
        </div>
      </div>
      <div className="-mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-2 rounded-full bg-live" />
        Live · updated just now
      </div>

      {hasMe && (
        <div className="flex flex-col gap-4 rounded-3xl bg-ink p-5 text-paper">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-[#CFC9BC]">
                {myOwed > 0 ? "You owe the pool" : myCredit > 0 ? "You're in credit" : "You're all square"}
              </div>
              <div className="font-display text-[42px] font-semibold leading-none tabular-money">{inr(myOwed > 0 ? myOwed : myCredit)}</div>
              <div className="text-[13px] text-[#CFC9BC]">
                {myOwed > 0
                  ? "Pay the banker to clear it"
                  : myCredit > 0
                    ? "You've put in more than your share so far."
                    : "Nothing pending. Enjoy the trip."}
              </div>
            </div>
            <button
              type="button"
              onClick={onGoMine}
              className="inline-flex h-11 items-center gap-1 rounded-full border border-[#4A4842] px-3 text-[13px] font-bold text-paper"
            >
              Breakdown
              <ChevronRightIcon width={16} height={16} />
            </button>
          </div>
          {settings.banker_upi_id && (
            <div className="flex items-center gap-3 rounded-2xl bg-ink-2 py-2.5 pl-3.5 pr-2.5">
              <div className="flex min-w-0 grow flex-col">
                <span className="text-xs text-[#CFC9BC]">Pay the banker via UPI</span>
                <span className="truncate font-bold">{settings.banker_upi_id}</span>
              </div>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-paper px-3.5 text-sm font-extrabold text-ink"
              >
                <CopyIcon width={16} height={16} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-muted">Central pool</span>
          <span className="text-[13px] text-muted">{spentPct}% used</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[32px] font-semibold leading-none tabular-money" style={{ color: balances.pool < 0 ? "var(--color-brick)" : undefined }}>
            {inr(Math.abs(balances.pool))}
          </span>
          <span className="text-muted">{balances.pool < 0 ? "over the pool" : "left to spend"}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#EDE8DD]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, spentPct))}%`, background: balances.pool < 0 ? "var(--color-brick)" : "var(--color-jade)" }} />
        </div>
        <div className="flex justify-between text-[13px] text-muted">
          <span>{inr(balances.poolSpent)} spent</span>
          <span>{inr(balances.depositedTotal)} deposited</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-4">
          <span className="text-xs font-bold text-muted">Everyone still owes</span>
          <span className="text-xl font-extrabold text-brick tabular-money">{inr(balances.unsettledTotal)}</span>
          <span className="text-xs text-muted">{owingCount} of {users.length} people</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-4">
          <span className="text-xs font-bold text-muted">Biggest category</span>
          <span className="text-xl font-extrabold">{topCatKey ? CATEGORY_META[topCatKey].label : "—"}</span>
          <span className="text-xs text-muted">{topCatKey ? inr(catTotals[topCatKey]) : inr(0)} so far</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold">Recent spends</h2>
          <button type="button" onClick={onGoExpenses} className="min-h-11 px-1 text-sm font-bold text-jade">
            See all
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {expenses.slice(0, 3).map((e, i) => (
            <ExpenseRow key={e.id} expense={e} users={users} meId={me?.id ?? null} hasMe={hasMe} bordered={i > 0} onOpen={() => onOpenExpense(e.id)} />
          ))}
          {expenses.length === 0 && <div className="p-6 text-center text-sm text-muted">No expenses logged yet.</div>}
        </div>
      </div>
    </div>
  );
}

function ExpenseRow({
  expense,
  users,
  meId,
  hasMe,
  bordered,
  onOpen,
}: {
  expense: Expense;
  users: TripUser[];
  meId: string | null;
  hasMe: boolean;
  bordered: boolean;
  onOpen: () => void;
}) {
  const cat = CATEGORY_META[expense.category];
  const payer = users.find((u) => u.id === expense.paid_by_id);
  const mine = meId ? expense.splits.find((s) => s.user_id === meId) : undefined;

  let share: string;
  let shareColor: string;
  if (!hasMe) {
    share = { equal: "Equal split", custom: "Custom amounts", select: "Select members" }[expense.split_method];
    shareColor = "var(--color-muted)";
  } else if (!mine) {
    share = "Not in this";
    shareColor = "var(--color-muted-2)";
  } else {
    share = `Your share: ${inr(mine.split_amount)}`;
    shareColor = "var(--color-muted)";
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left ${bordered ? "border-t border-line-soft" : ""}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: cat.bg, color: cat.fg }}>
        <CategoryIcon category={expense.category} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate font-bold">{expense.description}</span>
        <span className="text-xs text-muted">
          {payer?.name ?? "Someone"} paid · {expense.splits.length} people · {formatTime(expense.occurred_at)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-extrabold tabular-money">{inr(expense.amount)}</span>
        <span className="text-xs font-bold" style={{ color: shareColor }}>
          {share}
        </span>
      </span>
    </button>
  );
}

function ExpensesScreen({
  users,
  expenses,
  meId,
  hasMe,
  category,
  onCategory,
  onOpenExpense,
}: {
  users: TripUser[];
  expenses: Expense[];
  meId: string | null;
  hasMe: boolean;
  category: string;
  onCategory: (c: string) => void;
  onOpenExpense: (id: string) => void;
}) {
  const filtered = expenses.filter((e) => {
    if (category === "all") return true;
    if (category === "mine") return meId ? e.splits.some((s) => s.user_id === meId) : false;
    return e.category === category;
  });

  const groups: { label: string; total: number; items: Expense[] }[] = [];
  for (const e of filtered) {
    const label = formatDay(e.occurred_at);
    const g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push({ label, total: Number(e.amount), items: [e] });
    else {
      g.total += Number(e.amount);
      g.items.push(e);
    }
  }

  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const chips = hasMe ? CHIPS : CHIPS.filter((c) => c.key !== "mine");

  return (
    <div className="flex flex-col gap-4 pb-6 pt-8">
      <div className="flex flex-col gap-1 px-5">
        <h1 className="font-display text-[28px] font-semibold leading-tight">Where the money went</h1>
        <div className="text-sm text-muted">
          {inr(spent)} across {expenses.length} expenses · tap any to see the split
        </div>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
        {chips.map((c) => {
          const on = c.key === category;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onCategory(c.key)}
              aria-pressed={on}
              className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${
                on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-[18px] px-5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px] font-bold text-muted">
              <span>{g.label}</span>
              <span>{inr(g.total)}</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {g.items.map((e, i) => (
                <ExpenseRow key={e.id} expense={e} users={users} meId={meId} hasMe={hasMe} bordered={i > 0} onOpen={() => onOpenExpense(e.id)} />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#D8D1C2] bg-surface py-10 text-center text-muted">
            Nothing in this category yet.
          </div>
        )}
      </div>
    </div>
  );
}

function WhoOwesScreen({
  users,
  balances,
  meId,
}: {
  users: TripUser[];
  balances: ReturnType<typeof computeBalances>;
  meId: string | null;
}) {
  const maxOwed = Math.max(0, ...users.map((u) => balances.owed[u.id] ?? 0));
  const ordered = [...users].sort((a, b) => {
    if (a.id === meId) return -1;
    if (b.id === meId) return 1;
    return (balances.owed[b.id] ?? 0) - (balances.owed[a.id] ?? 0);
  });
  const clearCount = users.filter((u) => (balances.owed[u.id] ?? 0) === 0).length;

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight">Who owes what</h1>
        <div className="text-sm text-muted">Unpaid shares owed back to the pool</div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-[20px] bg-ink px-5 py-[18px] text-paper">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[#CFC9BC]">Still to collect</span>
          <span className="font-display text-[32px] font-semibold leading-tight tabular-money">{inr(balances.unsettledTotal)}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-2xl font-extrabold">
            {clearCount}
            <span className="text-sm font-semibold text-[#CFC9BC]"> of {users.length}</span>
          </span>
          <span className="text-[13px] text-[#CFC9BC]">all clear</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {ordered.map((m, i) => {
          const o = balances.owed[m.id] ?? 0;
          const deposited = balances.deposited[m.id] ?? 0;
          const credit = Math.max(0, -(balances.netOwed[m.id] ?? 0));
          const c = avatarColors(m.id, m.is_admin);
          const isMe = m.id === meId;
          const sub = o > 0 ? "Still owes" : credit > 0 ? "In credit" : "Nothing pending";
          return (
            <div
              key={m.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-line-soft" : ""}`}
              style={{ background: isMe ? "#FBF8F1" : "#FFFFFF" }}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                style={{ background: c.bg, color: c.fg }}
              >
                {initials(m.name)}
              </span>
              <div className="flex min-w-0 grow flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{m.name}</span>
                  {isMe && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-extrabold text-paper">You</span>}
                  {m.is_admin && <span className="rounded-full bg-jade-soft px-2 py-0.5 text-[11px] font-extrabold text-jade">Banker</span>}
                  {deposited > 0 && <span className="rounded-full bg-jade-soft px-2 py-0.5 text-[11px] font-extrabold text-jade">Paid in {inr(deposited)}</span>}
                </div>
                {o > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#F1ECE2]">
                    <div className="h-full rounded-full bg-brick" style={{ width: `${maxOwed > 0 ? Math.round((o / maxOwed) * 100) : 0}%` }} />
                  </div>
                )}
                <span className="text-xs text-muted">{sub}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 font-extrabold tabular-money" style={{ color: o > 0 ? "var(--color-brick)" : "var(--color-jade)" }}>
                {o === 0 && credit === 0 && <CheckIcon width={18} height={18} />}
                {o > 0 ? inr(o) : credit > 0 ? `${inr(credit)} credit` : "All clear"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-3 rounded-2xl bg-sand px-4 py-3.5 text-[13px] text-muted-3">
        <InfoIcon className="shrink-0" width={20} height={20} />
        <span>Paid already? Send the screenshot to the banker — your balance clears here as soon as it&apos;s logged.</span>
      </div>
    </div>
  );
}

function ExpenseDetailSheet({
  expense,
  users,
  meId,
  onClose,
}: {
  expense: Expense | null;
  users: TripUser[];
  meId: string | null;
  onClose: () => void;
}) {
  if (!expense) return null;
  const cat = CATEGORY_META[expense.category];
  const payer = users.find((u) => u.id === expense.paid_by_id);
  const methodLabel = { equal: "Equal split", custom: "Custom amounts", select: "Select members" }[expense.split_method];

  return (
    <div className="absolute inset-0 z-20">
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 h-full w-full bg-ink/50" />
      <div
        role="dialog"
        aria-label="Expense details"
        className="absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col gap-[18px] overflow-y-auto rounded-t-[28px] bg-paper px-5 pb-8 pt-2.5"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D1C2]" />
        <div className="flex items-center justify-between">
          <span className="inline-flex h-8 items-center gap-2 rounded-full py-0 pl-1.5 pr-3 text-[13px] font-extrabold" style={{ background: cat.bg, color: cat.fg }}>
            <CategoryIcon category={expense.category} width={18} height={18} />
            {cat.label}
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand">
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[26px] font-semibold leading-tight">{expense.description}</h2>
          <div className="font-display text-[40px] font-semibold leading-none tabular-money">{inr(expense.amount)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-4">
          <div className="flex justify-between py-3">
            <span className="text-muted">Paid by</span>
            <span className="font-bold">{payer ? payer.name + (payer.is_admin ? " (Banker)" : "") : "—"}</span>
          </div>
          <div className="flex justify-between border-t border-line-soft py-3">
            <span className="text-muted">Paid from</span>
            <span className="font-bold">{payer?.is_admin ? "Shared pool" : "Personal money"}</span>
          </div>
          <div className="flex justify-between border-t border-line-soft py-3">
            <span className="text-muted">When</span>
            <span className="font-bold">
              {formatDay(expense.occurred_at)} · {formatTime(expense.occurred_at)}
            </span>
          </div>
          <div className="flex justify-between border-t border-line-soft py-3">
            <span className="text-muted">Split</span>
            <span className="font-bold">
              {methodLabel} · {expense.splits.length} people
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-extrabold">Split between</h3>
            <span className="text-[13px] text-muted">{expense.splits.length} people</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {expense.splits.map((s, i) => {
              const u = users.find((x) => x.id === s.user_id);
              const c = avatarColors(s.user_id, u?.is_admin ?? false);
              const isMe = s.user_id === meId;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}
                  style={{ background: isMe ? "#FBF8F1" : "#FFFFFF" }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {u ? initials(u.name) : "?"}
                  </span>
                  <span className="grow font-bold">
                    {u?.name ?? "Removed member"}
                    {isMe ? " (you)" : ""}
                  </span>
                  <span className="font-extrabold tabular-money">{inr(s.split_amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ screen, onChange }: { screen: Screen; onChange: (s: Screen) => void }) {
  const items: { key: Screen; label: string; Icon: typeof HomeNavIcon }[] = [
    { key: "home", label: "Overview", Icon: HomeNavIcon },
    { key: "expenses", label: "Expenses", Icon: ExpensesNavIcon },
    { key: "owes", label: "Who owes", Icon: OwesNavIcon },
  ];
  return (
    <nav aria-label="Sections" className="grid shrink-0 grid-cols-3 border-t border-line bg-surface px-2 pb-[22px] pt-1.5">
      {items.map(({ key, label, Icon }) => {
        const on = screen === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-bold"
            style={{ color: on ? "var(--color-jade)" : "var(--color-muted-2)" }}
          >
            <Icon />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
