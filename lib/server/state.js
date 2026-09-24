// Shared bot runtime state, stored on the Node `global` object.
//
// This module is required both directly by server.js (plain CommonJS) and,
// indirectly, by Next.js API routes (which go through Next's own bundler).
// Those are two different module registries, so a plain `module.exports`
// singleton would NOT be shared between them. Attaching to `global` is what
// actually makes `global.waSocket` (etc.) visible from both sides in the same
// Node process — see Claude Engineering Specification.md, Requirement B.
if (!global.__kanakku) {
  global.__kanakku = {
    waSocket: null,
    status: "disconnected", // "connected" | "reconnecting" | "disconnected"
    qr: null,
    pairingCode: null,
    lastPingAt: null,
    starting: false,
    /** All set by lib/server/bot.js once the bot module has loaded. */
    requestPairingCode: null,
    clearSession: null,
    forceReconnect: null,
  };
}

module.exports = global.__kanakku;
