// Requirement B (Claude Engineering Specification.md): boot an embedded
// Baileys WhatsApp socket once, as a persistent background process living
// inside the same Node process as the Next.js server (see ../../server.js).
const {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const state = require("./state");
const { useSupabaseAuthState } = require("./supabaseAuthState");
const { getSupabaseAdmin } = require("./supabaseAdmin");

const RECONNECT_DELAY_MS = 4000;
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "silent" });

async function startBot() {
  if (state.starting) return;
  state.starting = true;

  try {
    const { state: authState, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      logger,
      browser: ["Kanakku", "Chrome", "1.0.0"],
      printQRInTerminal: false,
    });

    state.waSocket = sock;
    global.waSocket = sock; // per spec: API routes may call global.waSocket directly
    state.status = "reconnecting";

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qr = qr;
        state.pairingCode = null;
      }

      if (connection === "open") {
        state.status = "connected";
        state.qr = null;
        state.starting = false;
        console.log("[kanakku-bot] connected to WhatsApp");
      } else if (connection === "close") {
        state.waSocket = null;
        global.waSocket = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        state.status = loggedOut ? "disconnected" : "reconnecting";
        state.starting = false;

        console.warn(
          `[kanakku-bot] connection closed (statusCode=${statusCode}, loggedOut=${loggedOut})`,
          lastDisconnect?.error?.message || lastDisconnect?.error
        );

        if (!loggedOut) {
          setTimeout(() => startBot(), RECONNECT_DELAY_MS);
        } else {
          console.warn("[kanakku-bot] logged out — reconnect via the WhatsApp connection sheet");
        }
      }
    });

    state.requestPairingCode = async (phoneNumber) => {
      if (sock.authState.creds.registered) {
        throw new Error("This session is already linked to WhatsApp.");
      }
      const digits = String(phoneNumber || "").replace(/\D/g, "");
      if (!digits) throw new Error("A phone number is required to request a pairing code.");
      const code = await sock.requestPairingCode(digits);
      state.pairingCode = code;
      state.qr = null;
      return code;
    };
  } catch (err) {
    state.status = "disconnected";
    state.starting = false;
    console.error("[kanakku-bot] failed to start, retrying:", err);
    setTimeout(() => startBot(), RECONNECT_DELAY_MS * 2);
  }
}

/** Wipes the persisted session (used when a device unlinked WhatsApp itself, or
 * the stored creds got rejected — see the 401/loggedOut branch above). The next
 * startBot() will then generate fresh, unregistered creds instead of retrying
 * the same stale ones forever. */
async function clearSession() {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("baileys_auth").delete().not("id", "is", null);
  if (error) throw error;
}

/** Drops the current socket (if any) and starts a brand new connection attempt. */
async function forceReconnect() {
  if (state.waSocket) {
    try {
      state.waSocket.end(new Error("manual reconnect"));
    } catch (err) {
      console.warn("[kanakku-bot] error closing previous socket", err);
    }
  }
  state.waSocket = null;
  global.waSocket = null;
  state.qr = null;
  state.pairingCode = null;
  state.status = "reconnecting";
  state.starting = false;
  await startBot();
}

// Registered immediately (not only once a socket exists), so a "relink"
// request can recover even from a session that never connected in the
// first place, or one that's been fully logged out.
state.clearSession = clearSession;
state.forceReconnect = forceReconnect;

// Sending a message (used by POST /api/bad-cop) is implemented in
// lib/server/whatsapp.ts instead of here, deliberately — that file avoids
// importing this module (or Baileys) so Next.js never bundles Baileys into
// a Route Handler. It talks to the same running socket via global.waSocket.
module.exports = { startBot, clearSession, forceReconnect };
