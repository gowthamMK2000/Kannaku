// Deliberately does NOT import ./bot (or Baileys) — same reasoning as
// lib/server/whatsapp.ts: keeps Baileys out of the Next.js Route Handler
// bundle. Calls the functions bot.js registers on the shared global state.
export async function relinkWhatsApp(): Promise<void> {
  const state = global.__kanakku;
  if (!state?.clearSession || !state?.forceReconnect) {
    throw new Error("WhatsApp bot is not ready yet — try again in a moment.");
  }
  await state.clearSession();
  await state.forceReconnect();
}
