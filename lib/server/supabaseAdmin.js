const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabaseAdmin() {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing Supabase configuration: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

module.exports = { getSupabaseAdmin };
