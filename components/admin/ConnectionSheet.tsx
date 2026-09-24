"use client";

import { useEffect, useState } from "react";
import type { BotStatus } from "@/types";
import { CloseIcon } from "@/components/icons";

type LinkMode = "code" | "qr";

const BOT_META: Record<BotStatus, { label: string; bg: string; fg: string; dot: string }> = {
  connected: { label: "Connected", bg: "#E3EFE9", fg: "#1F6F54", dot: "#2E9C6A" },
  reconnecting: { label: "Reconnecting", bg: "#F7EBD3", fg: "#8A5A12", dot: "#D49B2C" },
  disconnected: { label: "Disconnected", bg: "#F8E4E0", fg: "#9A2F22", dot: "#C8432F" },
};

export default function ConnectionSheet({ botStatus, onClose }: { botStatus: BotStatus; onClose: () => void }) {
  const [mode, setMode] = useState<LinkMode>("code");
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingRelink, setConfirmingRelink] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [relinkError, setRelinkError] = useState<string | null>(null);

  const bot = BOT_META[botStatus];

  async function relink() {
    setRelinking(true);
    setRelinkError(null);
    try {
      const res = await fetch("/api/whatsapp-reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to reset the session.");
      setCode(null);
      setQrDataUrl(null);
      setConfirmingRelink(false);
    } catch (err) {
      setRelinkError(err instanceof Error ? err.message : "Failed to reset the session.");
    } finally {
      setRelinking(false);
    }
  }

  useEffect(() => {
    if (mode !== "qr" || botStatus === "connected") return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/qr", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setQrDataUrl(json.dataUrl ?? null);
      } catch {
        /* ignore transient poll failures */
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode, botStatus]);

  async function requestCode() {
    setRequesting(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/pairing-code", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't get a pairing code.");
      setCode(json.code);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Couldn't get a pairing code.");
    } finally {
      setRequesting(false);
    }
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="absolute inset-0 z-30">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-ink/50" />
      <div role="dialog" aria-label="WhatsApp connection" className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5 rounded-t-[28px] bg-paper-2 px-5 pb-8 pt-2">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D1C2]" />
        <div className="flex items-center justify-between">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold" style={{ background: bot.bg, color: bot.fg }}>
            <span className="h-2 w-2 rounded-full" style={{ background: bot.dot }} />
            {bot.label}
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand">
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <h2 className="font-display text-[26px] font-semibold leading-tight">Link the Bad Cop to WhatsApp</h2>

        {botStatus === "connected" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-jade-soft px-4 py-4 text-[15px] font-bold text-jade-text">
              WhatsApp is linked and ready. Bad Cop pings will post to your configured group.
            </div>
            {!confirmingRelink ? (
              <button
                type="button"
                onClick={() => setConfirmingRelink(true)}
                className="self-start px-1 text-[13px] font-extrabold text-muted"
              >
                Not the right account? Unlink &amp; start over
              </button>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-2xl bg-ink p-3.5 text-paper">
                <span className="font-extrabold">Unlink this WhatsApp session?</span>
                <span className="text-[13px] text-[#CFC9BC]">
                  This disconnects the currently working session for everyone. You&apos;ll need to pair a new number or scan a fresh QR.
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmingRelink(false)} className="h-12 grow rounded-[10px] border border-[#4A4842] font-bold text-paper">
                    Cancel
                  </button>
                  <button type="button" onClick={relink} disabled={relinking} className="h-12 grow rounded-[10px] bg-brick font-extrabold text-white disabled:opacity-60">
                    {relinking ? "Unlinking…" : "Yes, unlink"}
                  </button>
                </div>
              </div>
            )}
            {relinkError && <div className="rounded-xl bg-brick-soft px-4 py-3 text-sm font-bold text-[#9A2F22]">{relinkError}</div>}
          </div>
        )}

        {botStatus === "disconnected" && (
          <div className="flex flex-col gap-3 rounded-2xl bg-brick-soft px-4 py-4">
            <span className="text-[15px] font-bold text-[#9A2F22]">
              This session was disconnected — probably logged out from the phone, or the stored link expired.
            </span>
            <button type="button" onClick={relink} disabled={relinking} className="h-12 rounded-xl bg-ink text-sm font-extrabold text-white disabled:opacity-60">
              {relinking ? "Starting a new session…" : "Start a new connection"}
            </button>
            {relinkError && <span className="text-xs font-bold text-[#9A2F22]">{relinkError}</span>}
          </div>
        )}

        {botStatus !== "connected" && (
          <>
            <div role="radiogroup" aria-label="Link method" className="grid grid-cols-2 gap-1 rounded-2xl bg-sand p-1">
              <button type="button" role="radio" aria-checked={mode === "code"} onClick={() => setMode("code")} className="h-11 rounded-[10px] text-sm font-extrabold text-ink" style={{ background: mode === "code" ? "#FFFFFF" : "transparent", boxShadow: mode === "code" ? "0 1px 3px rgba(27,26,23,0.12)" : "none" }}>
                Pairing code
              </button>
              <button type="button" role="radio" aria-checked={mode === "qr"} onClick={() => setMode("qr")} className="h-11 rounded-[10px] text-sm font-extrabold text-ink" style={{ background: mode === "qr" ? "#FFFFFF" : "transparent", boxShadow: mode === "qr" ? "0 1px 3px rgba(27,26,23,0.12)" : "none" }}>
                QR code
              </button>
            </div>

            {mode === "code" && (
              <div className="flex flex-col gap-3">
                <span className="text-sm text-muted-3">You can&apos;t scan your own screen — type this code into WhatsApp on this phone instead.</span>
                {code ? (
                  <div className="flex items-center justify-between gap-2.5 rounded-2xl bg-ink py-4 pl-5 pr-4 text-paper">
                    <span className="text-xl font-extrabold tracking-widest">{code}</span>
                    <button type="button" onClick={copyCode} className="h-11 rounded-xl bg-paper px-3.5 text-sm font-extrabold text-ink">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={requestCode} disabled={requesting} className="h-12 rounded-xl bg-jade text-sm font-extrabold text-white disabled:opacity-60">
                    {requesting ? "Requesting…" : "Get pairing code"}
                  </button>
                )}
                {codeError && <div className="rounded-xl bg-brick-soft px-4 py-3 text-sm font-bold text-[#9A2F22]">{codeError}</div>}
                <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-[#33312C]">
                  <li>
                    WhatsApp → <b>Linked devices</b> → <b>Link a device</b>
                  </li>
                  <li>
                    Tap <b>Link with phone number instead</b>
                  </li>
                  <li>Enter the code above</li>
                </ol>
              </div>
            )}

            {mode === "qr" && (
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-line bg-surface p-4">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="WhatsApp pairing QR code" width={188} height={188} />
                  ) : (
                    <span className="text-center text-xs text-muted">Waiting for a QR code…</span>
                  )}
                </div>
                <span className="text-center text-[13px] text-muted">Open this on a laptop and scan it with the banker&apos;s phone. Refreshes automatically.</span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2.5 rounded-xl bg-sand px-3.5 py-3 text-[13px] text-muted-3">
          {botStatus === "connected" ? "Session saved — this survives restarts." : "Waiting to link… the session is saved, so you only do this once."}
        </div>
      </div>
    </div>
  );
}
