"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BotStatus, Expense, TripData } from "@/types";
import { computeBalances } from "@/lib/balances";
import { CATEGORY_META, formatRelative, formatTime, inr } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { addDeposit, deleteExpense, exitAdminMode } from "@/app/actions";
import {
  BadCopNavIcon,
  BankerIcon,
  CategoryIcon,
  CheckIcon,
  CopyIcon,
  ExpensesNavIcon,
  GearIcon,
  MoreIcon,
  OwesNavIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
} from "@/components/icons";
import LogExpenseSheet from "./LogExpenseSheet";
import ConnectionSheet from "./ConnectionSheet";
import TripSettingsSheet from "./TripSettingsSheet";

type Tab = "ledger" | "debts" | "badcop";

export default function AdminApp({ data, friendUrl }: { data: TripData; friendUrl: string }) {
  const { settings, users, expenses, deposits, payouts } = data;
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<Tab>("ledger");
  const [showLog, setShowLog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The connection sheet and settings sheet share a z-index, so only one can
  // be "on top" at a time — opening one from the other must close the first,
  // and remember to bring it back when the connection sheet closes.
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [settlingUserId, setSettlingUserId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus>("disconnected");

  // WhatsApp status is a side detail, not something worth polling
  // continuously regardless of what the banker is looking at. It's fetched
  // once on load (so the Bad Cop tab and Trip setup have a value at all),
  // then actively re-polled only while it's actually relevant: the Bad Cop
  // tab (its button's disabled state depends on it) or the connection sheet
  // itself (watching a pairing attempt resolve).
  const watchingBotStatus = tab === "badcop" || showConnection;
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setBotStatus(json.state);
      } catch {
        /* ignore transient poll failures */
      }
    }
    poll();
    if (!watchingBotStatus) return;
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watchingBotStatus]);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel("kanakku-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_settings" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_users" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => router.refresh())
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [router]);

  const balances = useMemo(() => computeBalances(expenses, users, deposits, payouts), [expenses, users, deposits, payouts]);
  const debtors = users.filter((u) => (balances.owed[u.id] ?? 0) > 0).sort((a, b) => (balances.owed[b.id] ?? 0) - (balances.owed[a.id] ?? 0));
  const spentPct =
    balances.depositedTotal > 0 ? Math.round(((balances.poolSpent + balances.payoutTotal) / balances.depositedTotal) * 100) : 0;

  function copyFriendLink() {
    navigator.clipboard?.writeText(friendUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  }

  function openSettle(userId: string, owed: number) {
    setSettlingUserId(userId);
    setSettleAmount(owed > 0 ? String(owed) : "");
  }

  function submitSettle() {
    if (!settlingUserId) return;
    const amount = parseFloat(settleAmount) || 0;
    if (amount <= 0) return;
    const userId = settlingUserId;
    startTransition(async () => {
      await addDeposit({ userId, amount, note: "Settled up" });
      setSettlingUserId(null);
      setSettleAmount("");
    });
  }

  function doDeleteExpense(id: string) {
    startTransition(async () => {
      await deleteExpense(id);
      setConfirmDeleteId(null);
      setOpenMenuId(null);
    });
  }

  const groups: { label: string; total: number; items: Expense[] }[] = [];
  for (const e of expenses) {
    const label = new Date(e.occurred_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push({ label, total: Number(e.amount), items: [e] });
    else {
      g.total += Number(e.amount);
      g.items.push(e);
    }
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-paper">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-paper px-5 py-3">
        <div className="flex min-w-0 grow flex-col leading-tight">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-jade">
            <BankerIcon />
            Banker
          </span>
          <span className="truncate font-display text-[22px] font-semibold">{settings.trip_name}</span>
        </div>
        <button
          type="button"
          onClick={copyFriendLink}
          aria-label="Copy friend link"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D8D1C2] bg-surface"
        >
          {linkCopied ? <CheckIcon width={18} height={18} className="text-jade" /> : <CopyIcon width={18} height={18} />}
        </button>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Trip settings"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D8D1C2] bg-surface"
        >
          <GearIcon width={18} height={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "ledger" && (
          <div className="flex flex-col gap-3.5 px-4 pb-24 pt-4">
            <div className="flex flex-col gap-2.5 rounded-[22px] bg-ink px-5 py-[18px] text-paper">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-[#CFC9BC]">Central pool</span>
                <span className="text-[13px] text-[#CFC9BC]">{spentPct}% used</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[36px] font-semibold leading-none tabular-money"
                  style={{ color: balances.pool < 0 ? "#FF8A75" : undefined }}
                >
                  {inr(Math.abs(balances.pool))}
                </span>
                <span className="text-[#CFC9BC]">{balances.pool < 0 ? "over the pool — bankers floated it" : "left"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#3A3934]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, spentPct))}%`, background: balances.pool < 0 ? "#B23A2B" : "#5BC08F" }}
                />
              </div>
              <div className="flex justify-between text-[13px] text-[#CFC9BC]">
                <span>{inr(balances.poolSpent)} spent</span>
                <span>{inr(balances.depositedTotal)} deposited</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setTab("debts")} className="flex flex-col items-start gap-0.5 rounded-2xl border border-line bg-surface p-3.5 text-left">
                <span className="text-xs font-bold text-muted">To collect</span>
                <span className="text-xl font-extrabold text-brick tabular-money">{inr(balances.unsettledTotal)}</span>
                <span className="text-xs text-muted">{debtors.length} people owe</span>
              </button>
              <button type="button" onClick={() => setTab("badcop")} className="flex flex-col items-start gap-0.5 rounded-2xl border border-line bg-surface p-3.5 text-left">
                <span className="text-xs font-bold text-muted">Last Bad Cop ping</span>
                <span className="text-[17px] font-extrabold leading-snug">{formatRelative(settings.last_bad_cop_sent_at)}</span>
                <span className="text-xs text-muted">Tap to nudge again</span>
              </button>
            </div>

            <div className="mt-1 flex items-center justify-between">
              <h1 className="text-lg font-extrabold">
                Expenses <span className="font-bold text-muted-2">{expenses.length}</span>
              </h1>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sand text-ink">
                <SearchIcon width={18} height={18} />
              </span>
            </div>

            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-2">
                <div className="flex justify-between px-1 text-[13px] font-bold text-muted">
                  <span>{g.label}</span>
                  <span>{inr(g.total)}</span>
                </div>
                <div className="rounded-2xl border border-line bg-surface">
                  {g.items.map((e, i) => {
                    const cat = CATEGORY_META[e.category];
                    const paidFromPool = !!users.find((u) => u.id === e.paid_by_id)?.is_admin;
                    return (
                      <div
                        key={e.id}
                        className={`relative flex min-h-[68px] items-center gap-3 py-2.5 pl-3.5 pr-1.5 ${i > 0 ? "border-t border-line-soft" : ""} ${i === 0 ? "rounded-t-2xl" : ""} ${i === g.items.length - 1 ? "rounded-b-2xl" : ""}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: cat.bg, color: cat.fg }}>
                          <CategoryIcon category={e.category} />
                        </span>
                        <div className="flex min-w-0 grow flex-col gap-1">
                          <span className="truncate font-bold">{e.description}</span>
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                              style={{ background: paidFromPool ? "#E3EFE9" : "#F3E4D3", color: paidFromPool ? "#1F6F54" : "#8A4B14" }}
                            >
                              {paidFromPool ? "Pool" : "Personal"}
                            </span>
                            <span className="whitespace-nowrap text-xs text-muted">{formatTime(e.occurred_at)}</span>
                          </div>
                        </div>
                        <span className="shrink-0 font-extrabold tabular-money">{inr(e.amount)}</span>
                        <button
                          type="button"
                          aria-label={`Edit or delete ${e.description}`}
                          onClick={() => setOpenMenuId(openMenuId === e.id ? null : e.id)}
                          className="flex h-11 w-9 shrink-0 items-center justify-center text-muted"
                        >
                          <MoreIcon />
                        </button>
                        {openMenuId === e.id && (
                          <div className="absolute right-2 top-14 z-10 w-40 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                            <button
                              type="button"
                              className="block w-full px-4 py-3 text-left text-sm font-bold"
                              onClick={() => {
                                setEditingExpense(e);
                                setOpenMenuId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="block w-full border-t border-line-soft px-4 py-3 text-left text-sm font-bold text-brick"
                              onClick={() => {
                                setConfirmDeleteId(e.id);
                                setOpenMenuId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#D8D1C2] bg-surface py-10 text-center text-muted">
                No expenses logged yet. Tap Log expense to add the first one.
              </div>
            )}
          </div>
        )}

        {tab === "debts" && (
          <div className="flex flex-col gap-3.5 px-4 pb-6 pt-4">
            <div className="flex flex-col gap-0.5">
              <h1 className="font-display text-[26px] font-semibold">Collect dues</h1>
              <span className="text-sm text-muted">Record a payment the moment the UPI lands.</span>
            </div>
            <div className="flex items-center justify-between rounded-[20px] bg-ink px-[18px] py-4 text-paper">
              <div className="flex flex-col">
                <span className="text-[13px] text-[#CFC9BC]">Still to collect</span>
                <span className="font-display text-[28px] font-semibold leading-tight tabular-money">{inr(balances.unsettledTotal)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xl font-extrabold">
                  {users.length - debtors.length}
                  <span className="text-sm font-semibold text-[#CFC9BC]"> of {users.length}</span>
                </span>
                <span className="text-[13px] text-[#CFC9BC]">all clear</span>
              </div>
            </div>
            {[...users]
              .sort((a, b) => (balances.owed[b.id] ?? 0) - (balances.owed[a.id] ?? 0))
              .map((m) => {
                const o = balances.owed[m.id] ?? 0;
                const items = balances.items[m.id] ?? [];
                const deposited = balances.deposited[m.id] ?? 0;
                const credit = Math.max(0, -(balances.netOwed[m.id] ?? 0));
                const settling = settlingUserId === m.id && o > 0;
                const headline = o > 0 ? inr(o) : credit > 0 ? `${inr(credit)} credit` : "All clear";
                const sub =
                  o > 0
                    ? `${items.length} ${items.length === 1 ? "share" : "shares"}`
                    : items.length > 0
                      ? "covered by deposit"
                      : "nothing pending";
                return (
                  <article key={m.id} className={`flex flex-col gap-3 rounded-[20px] border bg-surface p-4 ${settling ? "border-ink shadow-lg" : "border-line"}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-extrabold" style={{ background: m.is_admin ? "#1B1A17" : "#F3E4D3", color: m.is_admin ? "#F6F3EC" : "#8A4B14" }}>
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex min-w-0 grow flex-col">
                        <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold">
                          {m.name}
                          {m.is_admin && <span className="rounded-full bg-jade-soft px-2 py-0.5 text-[11px] font-extrabold text-jade">Banker</span>}
                          {deposited > 0 && <span className="rounded-full bg-jade-soft px-2 py-0.5 text-[11px] font-extrabold text-jade">Paid in {inr(deposited)}</span>}
                        </span>
                        <span className="text-[13px] text-muted">{m.phone_number || "No phone on file"}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-display text-2xl font-semibold leading-tight tabular-money" style={{ color: o > 0 ? "var(--color-brick)" : "var(--color-jade)" }}>
                          {headline}
                        </span>
                        <span className="text-xs text-muted">{sub}</span>
                      </div>
                    </div>
                    {o > 0 && items.length > 0 && (
                      <div className="rounded-[10px] bg-[#FAF8F3] px-3 py-2 text-[13px] text-muted-3">
                        {items
                          .slice(0, 2)
                          .map((it) => `${it.description} ${inr(it.amount)}`)
                          .join(" · ")}
                        {items.length > 2 ? ` · +${items.length - 2} more` : ""}
                      </div>
                    )}
                    {o > 0 && !settling && (
                      <button type="button" onClick={() => openSettle(m.id, o)} className="h-12 rounded-xl border border-ink bg-surface text-[15px] font-extrabold">
                        Settle up
                      </button>
                    )}
                    {settling && (
                      <div className="flex flex-col gap-2.5 rounded-2xl bg-ink p-3.5 text-paper">
                        <span className="font-extrabold">Log a payment from {m.name}</span>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] text-[#CFC9BC]">Amount received</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            className="h-11 rounded-[10px] border border-[#4A4842] bg-ink-2 px-3 text-[15px] font-extrabold text-paper outline-none"
                          />
                        </label>
                        <span className="text-[13px] text-[#CFC9BC]">Recorded as a deposit — their balance updates instantly.</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setSettlingUserId(null)} className="h-12 grow rounded-[10px] border border-[#4A4842] font-bold text-paper">
                            Cancel
                          </button>
                          <button type="button" onClick={submitSettle} className="h-12 grow rounded-[10px] bg-live font-extrabold text-white">
                            Log payment
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        )}

        {tab === "badcop" && (
          <BadCopTab settings={settings} debtorsCount={debtors.length} unsettledTotal={balances.unsettledTotal} botDown={botStatus === "disconnected"} onOpenConnection={() => setShowConnection(true)} />
        )}
      </div>

      {tab === "ledger" && (
        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="absolute bottom-[100px] right-4 z-[2] inline-flex h-14 items-center gap-2 rounded-full bg-jade pl-[18px] pr-[22px] text-base font-extrabold text-white shadow-[0_10px_24px_rgba(31,111,84,0.35)]"
        >
          <PlusIcon width={22} height={22} />
          Log expense
        </button>
      )}

      <nav aria-label="Sections" className="relative z-[2] grid shrink-0 grid-cols-3 gap-1 bg-surface px-3 pb-2 pt-1.5 shadow-[0_-8px_20px_rgba(27,26,23,0.06)]">
        <button
          type="button"
          onClick={() => setTab("ledger")}
          className="flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-xs font-extrabold transition-colors"
          style={{ background: tab === "ledger" ? "var(--color-jade-soft)" : "transparent", color: tab === "ledger" ? "var(--color-jade)" : "var(--color-muted-2)" }}
        >
          <ExpensesNavIcon width={18} height={18} />
          Ledger
        </button>
        <button
          type="button"
          onClick={() => setTab("debts")}
          className="relative flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-xs font-extrabold transition-colors"
          style={{ background: tab === "debts" ? "var(--color-jade-soft)" : "transparent", color: tab === "debts" ? "var(--color-jade)" : "var(--color-muted-2)" }}
        >
          <OwesNavIcon width={18} height={18} />
          Debts
          {debtors.length > 0 && (
            <span className="absolute right-1/4 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brick px-1 text-[11px] font-extrabold text-white">
              {debtors.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("badcop")}
          className="relative flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-xs font-extrabold transition-colors"
          style={{ background: tab === "badcop" ? "var(--color-jade-soft)" : "transparent", color: tab === "badcop" ? "var(--color-jade)" : "var(--color-muted-2)" }}
        >
          <BadCopNavIcon width={18} height={18} />
          Bad Cop
          {botStatus === "disconnected" && (
            <span className="absolute right-1/4 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brick px-1 text-[11px] font-extrabold text-white">!</span>
          )}
        </button>
      </nav>

      {showLog && <LogExpenseSheet users={users} onClose={() => setShowLog(false)} />}
      {editingExpense && <LogExpenseSheet users={users} expense={editingExpense} onClose={() => setEditingExpense(null)} />}
      {confirmDeleteId && (
        <div className="absolute inset-0 z-30 flex items-end bg-ink/50 p-4">
          <div className="flex w-full flex-col gap-3 rounded-2xl bg-surface p-5">
            <span className="text-base font-extrabold">Delete this expense?</span>
            <span className="text-sm text-muted">This removes it and every split tied to it. Friends will stop seeing it immediately.</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="h-12 grow rounded-xl border border-line font-bold">
                Cancel
              </button>
              <button type="button" onClick={() => doDeleteExpense(confirmDeleteId)} className="h-12 grow rounded-xl bg-brick font-extrabold text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showConnection && (
        <ConnectionSheet
          botStatus={botStatus}
          onClose={() => {
            setShowConnection(false);
            if (returnToSettings) {
              setShowSettings(true);
              setReturnToSettings(false);
            }
          }}
        />
      )}
      {showSettings && (
        <TripSettingsSheet
          settings={settings}
          users={users}
          deposits={deposits}
          payouts={payouts}
          depositedTotal={balances.depositedTotal}
          payoutTotal={balances.payoutTotal}
          botStatus={botStatus}
          onOpenConnection={() => {
            setShowSettings(false);
            setReturnToSettings(true);
            setShowConnection(true);
          }}
          onClose={() => setShowSettings(false)}
          onExitAdmin={() => startTransition(() => exitAdminMode())}
        />
      )}
    </div>
  );
}

function BadCopTab({
  settings,
  debtorsCount,
  unsettledTotal,
  botDown,
  onOpenConnection,
}: {
  settings: TripData["settings"];
  debtorsCount: number;
  unsettledTotal: number;
  botDown: boolean;
  onOpenConnection: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/bad-cop", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send.");
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
      setPhase("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[26px] font-semibold">Bad Cop</h1>
        <span className="text-sm text-muted">Nudges the group about who still owes what.</span>
      </div>

      {(phase === "idle" || phase === "error") && (
        <>
          <button
            type="button"
            onClick={() => setPhase("confirm")}
            disabled={botDown}
            className="flex h-16 items-center justify-center gap-2.5 rounded-2xl text-lg font-extrabold text-white"
            style={{ background: botDown ? "#B9B2A5" : "#B23A2B" }}
          >
            <SendIcon />
            Send Bad Cop ping
          </button>
          {botDown && (
            <button type="button" onClick={onOpenConnection} className="min-h-11 self-start font-extrabold text-[#9A2F22]">
              WhatsApp is offline — reconnect first
            </button>
          )}
          {error && <div className="rounded-xl bg-brick-soft px-4 py-3 text-sm font-bold text-[#9A2F22]">{error}</div>}
        </>
      )}

      {phase === "confirm" && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-ink p-4 text-paper">
          <span className="text-base font-extrabold">Send the Bad Cop ping to the group?</span>
          <span className="text-[13px] text-[#CFC9BC]">
            {debtorsCount} {debtorsCount === 1 ? "person" : "people"} pending, {inr(unsettledTotal)} total — this&apos;ll post straight to the group.
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhase("idle")} className="h-12 grow rounded-xl border border-[#4A4842] font-bold text-paper">
              Not yet
            </button>
            <button type="button" onClick={send} className="h-12 grow rounded-xl bg-brick font-extrabold text-white">
              Yes, send it
            </button>
          </div>
        </div>
      )}

      {phase === "sending" && <div className="rounded-2xl bg-sand px-4 py-3.5 text-center text-sm font-bold text-muted-3">Sending…</div>}

      {phase === "sent" && (
        <div className="flex items-center gap-3 rounded-2xl bg-jade-soft px-4 py-3.5 text-jade-text">
          <CheckIcon width={22} height={22} />
          <span className="grow font-extrabold">Sent to the group</span>
          <button type="button" onClick={() => setPhase("idle")} className="h-11 rounded-[10px] border border-jade px-3 text-[13px] font-extrabold text-jade-text">
            Done
          </button>
        </div>
      )}

      <span className="text-center text-[13px] text-muted">Last sent: {formatRelative(settings.last_bad_cop_sent_at)}</span>
    </div>
  );
}
