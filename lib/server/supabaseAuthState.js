// Requirement A (Claude Engineering Specification.md): a Baileys
// AuthenticationState implementation backed by Supabase instead of the
// filesystem, so the WhatsApp session survives Railway container restarts.
//
// Mirrors @whiskeysockets/baileys' own useMultiFileAuthState, but each
// key (`creds`, `app-state-sync-key-<id>`, `session-<id>`, ...) is a row in
// the `baileys_auth` table instead of a file on disk.
const { initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const { getSupabaseAdmin } = require("./supabaseAdmin");

async function readData(id) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("baileys_auth")
    .select("value")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Round-trip through BufferJSON so serialized Buffers (Uint8Array keys,
  // signatures, etc.) come back as real Buffer instances Baileys expects.
  return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
}

async function writeData(id, value) {
  const supabase = getSupabaseAdmin();
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  const { error } = await supabase
    .from("baileys_auth")
    .upsert({ id, value: serialized, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function removeData(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("baileys_auth").delete().eq("id", id);
  if (error) throw error;
}

async function useSupabaseAuthState() {
  const stored = await readData("creds");
  const creds = stored || initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      const data = {};
      await Promise.all(
        ids.map(async (id) => {
          const value = await readData(`${type}-${id}`);
          if (value) data[id] = value;
        })
      );
      return data;
    },
    set: async (data) => {
      const tasks = [];
      for (const category of Object.keys(data)) {
        for (const id of Object.keys(data[category])) {
          const value = data[category][id];
          const key = `${category}-${id}`;
          tasks.push(value ? writeData(key, value) : removeData(key));
        }
      }
      await Promise.all(tasks);
    },
  };

  const saveCreds = () => writeData("creds", creds);

  return { state: { creds, keys }, saveCreds };
}

module.exports = { useSupabaseAuthState };
