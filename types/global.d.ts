import type { WASocket } from "@whiskeysockets/baileys";
import type { BotStatus } from "./index";

declare global {
  var __kanakku:
    | {
        waSocket: WASocket | null;
        status: BotStatus;
        qr: string | null;
        pairingCode: string | null;
        lastPingAt: string | null;
        starting: boolean;
        requestPairingCode: ((phoneNumber: string) => Promise<string>) | null;
        /** Wipes the persisted Supabase session so the next connect starts unregistered. */
        clearSession: (() => Promise<void>) | null;
        /** Drops the current socket (if any) and calls startBot() again. */
        forceReconnect: (() => Promise<void>) | null;
      }
    | undefined;
  var waSocket: WASocket | null | undefined;
}

export {};
