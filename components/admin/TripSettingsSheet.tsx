"use client";

import { useState, useTransition } from "react";
import type { BotStatus, Deposit, Payout, TripSettings, TripUser } from "@/types";
import { addDeposit, addMember, addPayout, removeDeposit, removeMember, removePayout, updateTripSettings } from "@/app/actions";
import { inr, formatDay } from "@/lib/format";
import { CloseIcon, EyeIcon } from "@/components/icons";

const BOT_META: Record<BotStatus, { label: string; bg: string; fg: string; dot: string }> = {
  connected: { label: "Connected", bg: "#E3EFE9", fg: "#1F6F54", dot: "#2E9C6A" },
  reconnecting: { label: "Reconnecting", bg: "#F7EBD3", fg: "#8A5A12", dot: "#D49B2C" },
  disconnected: { label: "Disconnected", bg: "#F8E4E0", fg: "#9A2F22", dot: "#C8432F" },
};

export default function TripSettingsSheet({
  settings,
  users,
  deposits,
  payouts,
  depositedTotal,
  payoutTotal,
  botStatus,
  onOpenConnection,
  onClose,
  onExitAdmin,
}: {
  settings: TripSettings;
  users: TripUser[];
  deposits: Deposit[];
  payouts: Payout[];
  depositedTotal: number;
  payoutTotal: number;
  botStatus: BotStatus;
  onOpenConnection: () => void;
  onClose: () => void;
  onExitAdmin: () => void;
}) {
  const [tripName, setTripName] = useState(settings.trip_name);
  const [tripDates, setTripDates] = useState(settings.trip_dates ?? "");
  const [bankerUpiId, setBankerUpiId] = useState(settings.banker_upi_id ?? "");
  const [whatsappGroupJid, setWhatsappGroupJid] = useState(settings.whatsapp_group_jid ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  const [depositUserId, setDepositUserId] = useState(users[0]?.id ?? "");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");

  const [payoutUserId, setPayoutUserId] = useState(users[0]?.id ?? "");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");

  function saveSettings() {
    setError(null);
    startTransition(async () => {
      try {
        await updateTripSettings({ tripName, tripDates, bankerUpiId, whatsappGroupJid });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save trip settings.");
      }
    });
  }

  function submitMember() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await addMember({ name: newName, phoneNumber: newPhone, isAdmin: newIsAdmin });
        setNewName("");
        setNewPhone("");
        setNewIsAdmin(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add that member.");
      }
    });
  }

  function deleteMember(id: string) {
    startTransition(async () => {
      try {
        await removeMember(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that member.");
      }
    });
  }

  function submitDeposit() {
    if (!depositUserId || !depositAmount) return;
    setError(null);
    startTransition(async () => {
      try {
        await addDeposit({ userId: depositUserId, amount: parseFloat(depositAmount) || 0, note: depositNote });
        setDepositAmount("");
        setDepositNote("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't log that deposit.");
      }
    });
  }

  function deleteDeposit(id: string) {
    startTransition(async () => {
      try {
        await removeDeposit(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that deposit.");
      }
    });
  }

  function submitPayout() {
    if (!payoutUserId || !payoutAmount) return;
    setError(null);
    startTransition(async () => {
      try {
        await addPayout({ userId: payoutUserId, amount: parseFloat(payoutAmount) || 0, note: payoutNote });
        setPayoutAmount("");
        setPayoutNote("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't log that payout.");
      }
    });
  }

  function deletePayout(id: string) {
    startTransition(async () => {
      try {
        await removePayout(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that payout.");
      }
    });
  }

  return (
    <div className="absolute inset-0 z-30">
      <div role="dialog" aria-label="Trip settings" className="absolute inset-x-0 bottom-0 top-11 flex flex-col overflow-hidden rounded-t-[28px] bg-paper-2">
        <div className="flex shrink-0 items-center justify-between px-5 pb-1.5 pt-4">
          <h2 className="font-display text-2xl font-semibold">Trip setup</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <div className="flex min-h-0 grow flex-col gap-6 overflow-y-auto px-5 pb-8 pt-2">
          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">Trip</h3>
            <Field label="Trip name" value={tripName} onChange={setTripName} />
            <Field label="Dates" value={tripDates} onChange={setTripDates} placeholder="26–27 Sep" />
            <Field label="Banker UPI ID" value={bankerUpiId} onChange={setBankerUpiId} placeholder="name@upi" />
            <Field label="WhatsApp group JID" value={whatsappGroupJid} onChange={setWhatsappGroupJid} placeholder="12345678901-12345@g.us" />
            <button type="button" onClick={saveSettings} disabled={pending} className="h-12 rounded-xl bg-jade text-sm font-extrabold text-white disabled:opacity-60">
              {savedFlash ? "Saved" : pending ? "Saving…" : "Save trip settings"}
            </button>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">Deposits</h3>
              <span className="text-sm font-extrabold text-jade tabular-money">{inr(depositedTotal)} pool total</span>
            </div>
            <span className="text-xs text-muted">
              Money members have put into the shared pool, or paid back to settle their own balance.
            </span>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {deposits.map((d, i) => {
                const u = users.find((x) => x.id === d.user_id);
                return (
                  <div key={d.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                    <div className="flex min-w-0 grow flex-col">
                      <span className="font-bold">{u?.name ?? "Removed member"}</span>
                      <span className="text-xs text-muted">
                        {formatDay(d.deposited_at)}
                        {d.note ? ` · ${d.note}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 font-extrabold tabular-money">{inr(d.amount)}</span>
                    <button type="button" onClick={() => deleteDeposit(d.id)} className="min-h-9 shrink-0 px-2 text-xs font-bold text-brick">
                      Remove
                    </button>
                  </div>
                );
              })}
              {deposits.length === 0 && <div className="p-4 text-center text-sm text-muted">No deposits logged yet.</div>}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#D8D1C2] p-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-muted">Who deposited</span>
                <select
                  value={depositUserId}
                  onChange={(e) => setDepositUserId(e.target.value)}
                  className="h-12 rounded-xl border border-[#D8D1C2] bg-surface px-3.5 text-[15px] outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Amount" value={depositAmount} onChange={setDepositAmount} inputMode="decimal" placeholder="0" />
              <Field label="Note (optional)" value={depositNote} onChange={setDepositNote} placeholder="e.g., UPI transfer" />
              <button
                type="button"
                onClick={submitDeposit}
                disabled={pending || !depositUserId || !depositAmount}
                className="h-11 rounded-xl border border-ink text-sm font-extrabold disabled:opacity-50"
              >
                Log deposit
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">Payouts</h3>
              <span className="text-sm font-extrabold text-brick tabular-money">{inr(payoutTotal)} paid out</span>
            </div>
            <span className="text-xs text-muted">Money the banker has paid back to a member — the reverse of a deposit.</span>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {payouts.map((p, i) => {
                const u = users.find((x) => x.id === p.user_id);
                return (
                  <div key={p.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                    <div className="flex min-w-0 grow flex-col">
                      <span className="font-bold">{u?.name ?? "Removed member"}</span>
                      <span className="text-xs text-muted">
                        {formatDay(p.paid_at)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 font-extrabold tabular-money">{inr(p.amount)}</span>
                    <button type="button" onClick={() => deletePayout(p.id)} className="min-h-9 shrink-0 px-2 text-xs font-bold text-brick">
                      Remove
                    </button>
                  </div>
                );
              })}
              {payouts.length === 0 && <div className="p-4 text-center text-sm text-muted">No payouts logged yet.</div>}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#D8D1C2] p-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold text-muted">Who&apos;s being paid</span>
                <select
                  value={payoutUserId}
                  onChange={(e) => setPayoutUserId(e.target.value)}
                  className="h-12 rounded-xl border border-[#D8D1C2] bg-surface px-3.5 text-[15px] outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Amount" value={payoutAmount} onChange={setPayoutAmount} inputMode="decimal" placeholder="0" />
              <Field label="Note (optional)" value={payoutNote} onChange={setPayoutNote} placeholder="e.g., Refunded surplus" />
              <button
                type="button"
                onClick={submitPayout}
                disabled={pending || !payoutUserId || !payoutAmount}
                className="h-11 rounded-xl border border-ink text-sm font-extrabold disabled:opacity-50"
              >
                Log payout
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">WhatsApp</h3>
            <button
              type="button"
              onClick={onOpenConnection}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: BOT_META[botStatus].dot }} />
              <span className="flex min-w-0 grow flex-col">
                <span className="font-bold">{BOT_META[botStatus].label}</span>
                <span className="text-xs text-muted">Bad Cop pings send through this session</span>
              </span>
              <span className="shrink-0 text-sm font-extrabold text-jade">Manage</span>
            </button>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">Members</h3>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {users.map((u, i) => (
                <div key={u.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: u.is_admin ? "#1B1A17" : "#F3E4D3", color: u.is_admin ? "#F6F3EC" : "#8A4B14" }}>
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 grow flex-col">
                    <span className="font-bold">
                      {u.name} {u.is_admin && <span className="text-xs font-bold text-jade">· Banker</span>}
                    </span>
                    {u.phone_number && <span className="text-xs text-muted">{u.phone_number}</span>}
                  </div>
                  <button type="button" onClick={() => deleteMember(u.id)} className="min-h-9 shrink-0 px-2 text-xs font-bold text-brick">
                    Remove
                  </button>
                </div>
              ))}
              {users.length === 0 && <div className="p-4 text-center text-sm text-muted">No members yet.</div>}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#D8D1C2] p-3.5">
              <Field label="Name" value={newName} onChange={setNewName} placeholder="New member's name" />
              <Field label="Phone (optional)" value={newPhone} onChange={setNewPhone} placeholder="+91…" />
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="h-5 w-5 accent-jade" />
                This person is a banker (can log in as admin)
              </label>
              <button type="button" onClick={submitMember} disabled={pending || !newName.trim()} className="h-11 rounded-xl border border-ink text-sm font-extrabold disabled:opacity-50">
                Add member
              </button>
            </div>
          </section>

          {error && <div className="rounded-xl bg-brick-soft px-4 py-3 text-sm font-bold text-[#9A2F22]">{error}</div>}

          <button type="button" onClick={onExitAdmin} className="inline-flex items-center justify-center gap-2 self-start px-1 text-sm font-extrabold text-jade">
            <EyeIcon width={16} height={16} />
            View as friend
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "decimal";
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-muted">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl border border-[#D8D1C2] bg-surface px-3.5 text-[15px] outline-none"
      />
    </label>
  );
}
