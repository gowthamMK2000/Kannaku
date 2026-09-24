// Deliberately does NOT import @whiskeysockets/baileys (or ./bot, which
// does). That package is pure ESM with optional jimp/sharp dynamic imports
// that Turbopack tries — and fails — to resolve when bundling a Route
// Handler. server.js already requires it natively via plain Node `require`
// (Node 24 handles ESM interop fine there) and publishes the live socket on
// `global.waSocket`, exactly as Claude Engineering Specification.md,
// Requirement B describes. This file just calls that global directly, so
// app/api/bad-cop/route.ts never pulls Baileys into the Next.js bundle.
export async function sendGroupMessage(text: string, jid?: string): Promise<void> {
  const targetJid = jid || process.env.WHATSAPP_GROUP_JID;
  if (!targetJid) throw new Error("WHATSAPP_GROUP_JID is not configured.");

  const sock = global.waSocket;
  if (!sock) throw new Error("WhatsApp is not connected.");

  await sock.sendMessage(targetJid, { text });

  if (global.__kanakku) {
    global.__kanakku.lastPingAt = new Date().toISOString();
  }
}
