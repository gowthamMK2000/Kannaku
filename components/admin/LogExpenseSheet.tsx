"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, Expense, SplitMethod, TripUser } from "@/types";
import { inr } from "@/lib/format";
import { computeSplits } from "@/lib/splits";
import { createExpense, updateExpense } from "@/app/actions";
import { CloseIcon } from "@/components/icons";

const CATEGORIES: { key: Category; label: string; bg: string; fg: string }[] = [
  { key: "food", label: "Food", bg: "#F3E4D3", fg: "#8A4B14" },
  { key: "stay", label: "Stay", bg: "#E1E8F0", fg: "#2F4A6B" },
  { key: "travel", label: "Travel", bg: "#E4EDE2", fg: "#2F5A3A" },
  { key: "fun", label: "Fun", bg: "#EFE2EE", fg: "#6B3566" },
];

const METHODS: { key: SplitMethod; label: string; hint: string }[] = [
  { key: "equal", label: "Equally", hint: "Everyone ticked below pays the same share." },
  { key: "custom", label: "Custom", hint: "Type each person's share — must add up to the total." },
  { key: "select", label: "Some people", hint: "Only the people ticked below were part of this." },
];

export default function LogExpenseSheet({
  users,
  expense,
  onClose,
}: {
  users: TripUser[];
  expense?: Expense;
  onClose: () => void;
}) {
  const editing = !!expense;
  const banker = users.find((u) => u.is_admin) ?? users[0];

  const [amountStr, setAmountStr] = useState(expense ? String(expense.amount) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState<Category>(expense?.category ?? "fun");
  const [payerId, setPayerId] = useState(expense?.paid_by_id ?? banker?.id ?? "");
  const [method, setMethod] = useState<SplitMethod>(expense?.split_method ?? "equal");
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    users.forEach((u) => {
      init[u.id] = expense ? expense.splits.some((s) => s.user_id === u.id) : true;
    });
    return init;
  });
  const [customShares, setCustomShares] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (expense) expense.splits.forEach((s) => (init[s.user_id] = String(s.split_amount)));
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amount = parseFloat(amountStr.replace(/[^0-9.]/g, "")) || 0;
  const participantIds = useMemo(() => users.filter((u) => included[u.id]).map((u) => u.id), [users, included]);

  const preview = useMemo(
    () =>
      computeSplits({
        method,
        amount,
        participantIds,
        customShares: Object.fromEntries(Object.entries(customShares).map(([k, v]) => [k, parseFloat(v) || 0])),
      }),
    [method, amount, participantIds, customShares]
  );
  const previewByUser = Object.fromEntries(preview.map((p) => [p.userId, p.amount]));
  const each = participantIds.length ? amount / participantIds.length : 0;

  function toggle(userId: string) {
    setIncluded((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function submit() {
    setError(null);
    const shares = Object.fromEntries(Object.entries(customShares).map(([k, v]) => [k, parseFloat(v) || 0]));
    startTransition(async () => {
      try {
        if (editing && expense) {
          await updateExpense({
            expenseId: expense.id,
            description,
            amount,
            category,
            paidById: payerId,
            splitMethod: method,
            participantIds,
            customShares: method === "custom" ? shares : undefined,
          });
        } else {
          await createExpense({
            description,
            amount,
            category,
            paidById: payerId,
            splitMethod: method,
            participantIds,
            customShares: method === "custom" ? shares : undefined,
          });
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const customSum = participantIds.reduce((acc, id) => acc + (parseFloat(customShares[id]) || 0), 0);
  const hasNegativeCustomShare = participantIds.some((id) => (parseFloat(customShares[id]) || 0) < 0);
  const canSubmit =
    description.trim().length > 0 &&
    amount > 0 &&
    participantIds.length > 0 &&
    !!payerId &&
    (method !== "custom" || (!hasNegativeCustomShare && Math.abs(customSum - amount) < 0.01));

  return (
    <div className="absolute inset-0 z-30">
      <div role="dialog" aria-label={editing ? "Edit expense" : "Log new expense"} className="absolute inset-x-0 bottom-0 top-11 flex flex-col overflow-hidden rounded-t-[28px] bg-paper-2">
        <div className="flex shrink-0 flex-col items-center pt-2">
          <div className="h-1.5 w-10 rounded-full bg-[#D8D1C2]" />
          <div className="flex w-full items-center justify-between px-5 py-1.5">
            <h2 className="font-display text-2xl font-semibold">{editing ? "Edit expense" : "New expense"}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand">
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 grow flex-col gap-[18px] overflow-y-auto px-5 pb-5 pt-1">
          <label className="flex flex-col items-center gap-0.5 py-3">
            <span className="text-[13px] font-bold text-muted">Amount</span>
            <span className="flex items-baseline justify-center gap-1">
              <span className="font-display text-[34px] font-semibold text-muted">₹</span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Amount in rupees"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="w-[200px] border-0 bg-transparent text-center font-display text-[52px] font-semibold text-ink outline-none"
              />
            </span>
            <span className="h-0.5 w-[180px] rounded-sm bg-jade" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-extrabold">What was it for?</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Houseboat dinner"
              className="h-[52px] rounded-2xl border border-[#D8D1C2] bg-surface px-3.5 text-base text-ink outline-none"
            />
          </label>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-extrabold">Category</legend>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const on = c.key === category;
                return (
                  <label
                    key={c.key}
                    className="relative flex h-11 items-center justify-center rounded-xl border text-sm font-extrabold"
                    style={{ borderColor: on ? c.fg : "var(--color-line)", background: on ? c.bg : "#FFFFFF", color: on ? c.fg : "var(--color-ink)" }}
                  >
                    <input type="radio" name="cat" checked={on} onChange={() => setCategory(c.key)} className="absolute h-px w-px opacity-0" />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-extrabold">Paid by</legend>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {users.map((u) => {
                const on = u.id === payerId;
                return (
                  <label
                    key={u.id}
                    className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border py-0 pl-1.5 pr-3.5 text-sm font-extrabold"
                    style={{ borderColor: on ? "#1B1A17" : "var(--color-line)", background: on ? "#1B1A17" : "#FFFFFF", color: on ? "#F6F3EC" : "#1B1A17" }}
                  >
                    <input type="radio" name="payer" checked={on} onChange={() => setPayerId(u.id)} className="absolute h-px w-px opacity-0" />
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs" style={{ background: u.is_admin ? "#1B1A17" : "#F3E4D3", color: u.is_admin ? "#F6F3EC" : "#8A4B14", boxShadow: "0 0 0 2px #FFFFFF" }}>
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                    {u.is_admin ? `${u.name} · pool` : u.name}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-extrabold">How to split</legend>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-sand p-1">
              {METHODS.map((m) => {
                const on = m.key === method;
                return (
                  <label key={m.key} className="relative flex h-11 items-center justify-center rounded-[10px] text-sm font-extrabold" style={{ background: on ? "#FFFFFF" : "transparent", boxShadow: on ? "0 1px 3px rgba(27,26,23,0.12)" : "none" }}>
                    <input type="radio" name="method" checked={on} onChange={() => setMethod(m.key)} className="absolute h-px w-px opacity-0" />
                    {m.label}
                  </label>
                );
              })}
            </div>
            <span className="mt-1.5 block text-xs text-muted">{METHODS.find((m) => m.key === method)?.hint}</span>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-extrabold">
              Who&apos;s in? <span className="font-bold text-muted">{participantIds.length} of {users.length}</span>
            </legend>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {users.map((u, i) => {
                const on = included[u.id];
                return (
                  <label key={u.id} className={`flex min-h-14 items-center gap-3 px-3.5 py-1.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(u.id)} className="h-[22px] w-[22px] accent-jade" />
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: u.is_admin ? "#1B1A17" : "#F3E4D3", color: u.is_admin ? "#F6F3EC" : "#8A4B14" }}>
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="grow font-bold">{u.name}</span>
                    {method !== "custom" || !on ? (
                      <span className="font-extrabold tabular-money" style={{ color: on ? "var(--color-jade)" : "var(--color-muted-2)" }}>
                        {on ? inr(previewByUser[u.id] ?? each) : "Not in"}
                      </span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${u.name} share`}
                        value={customShares[u.id] ?? ""}
                        onChange={(e) => setCustomShares((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        className="w-[84px] rounded-[10px] border border-[#D8D1C2] px-2.5 py-2 text-right text-[15px] font-extrabold outline-none"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && <div className="rounded-xl bg-brick-soft px-4 py-3 text-sm font-bold text-[#9A2F22]">{error}</div>}
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-surface px-5 pb-7 pt-3">
          <span className="text-center text-[13px] font-bold text-muted-3">
            {method === "custom"
              ? hasNegativeCustomShare
                ? "Custom shares can't be negative"
                : `Custom shares for ${participantIds.length} people${Math.abs(customSum - amount) < 0.01 ? "" : ` · adds up to ${inr(customSum)}, need ${inr(amount)}`}`
              : `Split between ${participantIds.length} · ${inr(each)} each`}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || pending}
            className="h-14 rounded-2xl bg-jade text-[17px] font-extrabold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? `Save ${inr(amount)} expense` : `Log ${inr(amount)} expense`}
          </button>
        </div>
      </div>
    </div>
  );
}
